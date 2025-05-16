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
import {CustomResource, Duration} from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';
import { NagSuppressions } from 'cdk-nag';
import { DZ_APPLICATION_NAME } from '../config/Config';
import { CommonUtils } from './utils/CommonUtils';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import {Provider} from "aws-cdk-lib/custom-resources";

interface DzBackupStackProps extends cdk.StackProps {
  secondaryRegion: string;
  backupIntervalMinutes: number;
  applicationName: string;
  stageName: string;
  domainIdentifier: string;
  projectIdentifier: string;
  projectName: string;
  manageProjectMembershipCustomResource: Provider;
  datameshEncryptionKey: kms.Key;
  primaryDynamoDBEncryptionKey: kms.Key;
  secondaryDynamoDBEncryptionKeyArn: string;
}

export class DzBackupStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props: DzBackupStackProps) {
    super(scope, id, props);

    const dzStateStoreTableArn = this.createDZStateStore(props);

    const dzStateManager = this.createDZStateManager(props, dzStateStoreTableArn);

    this.createDzBackupInitiator(props, dzStateManager)


    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/dz-resiliencyStateManager/Role/DefaultPolicy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: ' The S3 Bucket does not require server access logs',
          },
        ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.node.path}/DataZoneAssetsRegistrar-Policy/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: ' The S3 Bucket does not require server access logs',
          },
        ],
    );
  }

  private createDZStateStore(props: DzBackupStackProps) {
    const dynamoDBGlobalTable = new dynamodb.CfnGlobalTable(this, `${props.applicationName}AssetsInfo`, {
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

  private getDataAssetsRegistrarRolePolicy( lambdaName: string, props: DzBackupStackProps) {
    return new iam.Policy(this, `${lambdaName}-Policy`, {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'dynamodb:PutItem',
          ],
          resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/*`],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/ApplicationName': DZ_APPLICATION_NAME,
            },
          },
        }),
        new iam.PolicyStatement({
          actions: [
            'kms:Encrypt',
            'kms:Decrypt',
            'kms:GenerateDataKey*',
            'kms:ReEncrypt*',
          ],
          resources: [props.primaryDynamoDBEncryptionKey.keyArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'kms:Decrypt'
          ],
          resources: [props.datameshEncryptionKey.keyArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'datazone:Search',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:PutLogEvents',
          ],
          resources: [
            `arn:aws:logs:${this.region}:${this.account}:log-group:*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:*:log-stream:*`
          ],
        }),
      ],
    });
  }

  private createAssetRegistrarProjectMembership(props: DzBackupStackProps, lambdaRole: iam.Role) {
    const assetRegistrarProjectMembershipCustomResource =
        props.manageProjectMembershipCustomResource;

    return new CustomResource(
        this,
        `${props.projectName}-AssetRegistrarProjectMembership`,
        {
          serviceToken: assetRegistrarProjectMembershipCustomResource.serviceToken,
          properties: {
            DomainId: props.domainIdentifier,
            ProjectId: props.projectIdentifier,
            ProjectName: props.projectName,
            Designation: 'PROJECT_CONTRIBUTOR',
            UserIdentifier: lambdaRole.roleArn,
          },
        },
    );
  }


  private createDZStateManager(props: DzBackupStackProps,
                               dzStateStoreTableArn: string) {
    const lambdaName = 'DataZoneAssetsRegistrar';
    const lambdaHandler = 'dz_assets_registrar.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaPolicy = this.getDataAssetsRegistrarRolePolicy(lambdaName, props);

    const lambdaRole = CommonUtils.getLambdaExecutionRole(
        this,
        lambdaName,
        lambdaPolicy,
    );


    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
          path.join(
              __dirname,
              '../src/lambda-functions/dz_assets_registrar',
          ),
      ),
      role: lambdaRole,
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
            this,
            `${lambdaName}-lambda-powertools`,
            `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV3-python313-x86_64:12`,
        ),
      ],
      environment: {
        LOG_LEVEL: 'INFO',
        DZ_DOMAIN_ID: props.domainIdentifier,
        DZ_PROJECT_ID: props.projectIdentifier,
        DZ_STATE_STORE_TABLE_ARN: dzStateStoreTableArn,
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    const assetRegistrarProjectMembership = this.createAssetRegistrarProjectMembership(props, lambdaRole)


    const lambdaTask = new tasks.LambdaInvoke(this, 'InvokeDZAssetsRegistrar', {
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

  private createDzBackupInitiator(props: DzBackupStackProps,
                                  dzStateManager : stepfunctions.StateMachine) {
    const rule = new events.Rule(this, `${props.applicationName}ScheduleRule`, {
      schedule: events.Schedule.rate(cdk.Duration.minutes(props.backupIntervalMinutes)),
      description: `Triggers step function every ${props.backupIntervalMinutes} minutes`,
      enabled: true,
    });

    rule.addTarget(new targets.SfnStateMachine(dzStateManager, {
      input: events.RuleTargetInput.fromObject({
        timestamp: events.EventField.time,
        detail: events.EventField.fromPath('$.detail'),
      }),
      retryAttempts: 3,
      maxEventAge: cdk.Duration.hours(2),
    }));
  }

}
