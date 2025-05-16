/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import { SMUS_ASSETS_REGISTRAR_ROLE_ARN } from '../config/Config';
import { NagSuppressions } from 'cdk-nag';
import { CommonUtils } from './utils/CommonUtils';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

interface SmusBackupStackProps extends cdk.StackProps {
  secondaryRegion: string;
  backupIntervalMinutes: number;
  applicationName: string;
  domainIdentifier: string;
  projectIdentifier: string;
  primaryDynamoDBEncryptionKey: kms.Key;
  secondaryDynamoDBEncryptionKeyArn: string;
}

export class SmusBackupStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: SmusBackupStackProps) {
    super(scope, id, props);

    const smusStateStoreTableArn = this.createSMUSStateStore(props);

    const smusStateManager = this.createSMUSStateManager(props, smusStateStoreTableArn);

    this.createSMUSBackupInitiator(props, smusStateManager)


    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/smus-resiliencyStateManager/Role/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: ' The S3 Bucket does not require server access logs',
          },
        ],
    );
  }

  private createSMUSStateStore(props: SmusBackupStackProps) {
    const dynamoDBGlobalTable = new dynamodb.CfnGlobalTable(this, `${props.applicationName}SMUSAssetsInfo`, {
      attributeDefinitions: [
        {
          attributeName: 'AssetId',
          attributeType: 'S'
        }
      ],
      keySchema: [
        {
          attributeName: 'AssetId',
          keyType: 'HASH'
        }
      ],
      billingMode: 'PAY_PER_REQUEST',
      streamSpecification: {
        streamViewType: 'NEW_AND_OLD_IMAGES'
      },
      sseSpecification: {
        sseEnabled: true,
        sseType: 'KMS'
      },
      replicas: [
        {
          region: this.region,
          sseSpecification: {
            kmsMasterKeyId: props.primaryDynamoDBEncryptionKey.keyArn,
          },
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true
          },
          contributorInsightsSpecification: {
            enabled: true
          }
        },
        {
          region: props.secondaryRegion,
          sseSpecification: {
            kmsMasterKeyId: props.secondaryDynamoDBEncryptionKeyArn,
          },
          pointInTimeRecoverySpecification: {
            pointInTimeRecoveryEnabled: true
          },
          contributorInsightsSpecification: {
            enabled: true
          },
        }
      ]
    });

    return dynamoDBGlobalTable.attrArn;
  }


  private createSMUSStateManager(props: SmusBackupStackProps,
                               smusStateStoreTableArn: string) {
    const lambdaName = 'SageMakerUnifiedStudioAssetsRegistrar';
    const lambdaHandler = 'smus_assets_registrar.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
          path.join(
              __dirname,
              '../src/lambda-functions/smus_assets_registrar',
          ),
      ),
      role: iam.Role.fromRoleArn(
          this,
          `${lambdaName}Role`,
          SMUS_ASSETS_REGISTRAR_ROLE_ARN,
      ),
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
            this,
            `${lambdaName}-lambda-powertools`,
            `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:12`,
        ),
      ],
      environment: {
        LOG_LEVEL: 'INFO',
        SMUS_DOMAIN_ID: props.domainIdentifier,
        SMUS_PROJECT_ID: props.projectIdentifier,
        SMUS_STATE_STORE_TABLE_ARN: smusStateStoreTableArn,
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    const lambdaTask = new tasks.LambdaInvoke(this, 'InvokeSMUSAssetsRegistrar', {
      lambdaFunction: lambdaFunction,
      retryOnServiceExceptions: true,
      payload: stepfunctions.TaskInput.fromObject({
        input: stepfunctions.JsonPath.stringAt('$'),
        timestamp: stepfunctions.JsonPath.stringAt('$$.Execution.StartTime')
      })
    });

    lambdaTask.addRetry({
      maxAttempts: 1,
      maxDelay: Duration.seconds(5),
      jitterStrategy: stepfunctions.JitterType.FULL,
    });



    const successState = new stepfunctions.Succeed(this, 'SuccessState');
    const failState = new stepfunctions.Fail(this, 'FailState', {
      cause: 'Lambda function failed',
      error: 'LambdaError'
    });

    lambdaTask.addCatch(
        failState, {
          errors: ['States.TaskFailed'],
          resultPath: '$.error'
        });

    return new stepfunctions.StateMachine(this, `${props.applicationName}StateManager`, {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(
          lambdaTask
              .next(successState)
      ),
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      stateMachineType: stepfunctions.StateMachineType.STANDARD,
      logs: {
        destination: new logs.LogGroup(this, `${props.applicationName}StateMachineLogs`, {
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY
        }),
        level: stepfunctions.LogLevel.ALL
      }
    });

  }

  private createSMUSBackupInitiator(props: SmusBackupStackProps,
                                  smusStateManager : stepfunctions.StateMachine) {
    const rule = new events.Rule(this, `${props.applicationName}ScheduleRule`, {
      schedule: events.Schedule.rate(cdk.Duration.minutes(props.backupIntervalMinutes)),
      description: `Triggers step function every ${props.backupIntervalMinutes} minutes`,
      enabled: true,
    });

    rule.addTarget(new targets.SfnStateMachine(smusStateManager, {
      input: events.RuleTargetInput.fromObject({
        timestamp: events.EventField.time,
        detail: events.EventField.fromPath('$.detail'),
      }),
      retryAttempts: 3,
      maxEventAge: cdk.Duration.hours(2),
    }));
  }

}
