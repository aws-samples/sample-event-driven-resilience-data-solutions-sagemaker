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
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NagSuppressions } from 'cdk-nag';
import { CDK_EXEC_ROLE_ARN } from '../config/Config';
import { CommonUtils } from './utils/CommonUtils';

interface DzDataMeshHelperStackProps extends cdk.StackProps {
  applicationName: string;
  stageName: string;
}

export class DzHelperStack extends cdk.Stack {
  public readonly encryptionKey: kms.Key;
  public readonly rootDomainDzProvisioningRoleArn: string;
  public readonly rootDomainBlueprintBucketName: string;
  public readonly manageProjectMembershipCustomResource: Provider;
  public readonly manageGlossaryCustomResource: Provider;
  public readonly manageMetadataFormCustomResource: Provider;

  constructor(scope: Construct, id: string, props: DzDataMeshHelperStackProps) {

    super(scope, id, props);

    const blueprintBucket = this.createDzBlueprintBucket();
    this.rootDomainBlueprintBucketName = `s3://${blueprintBucket.bucketName}`;

    //TODO: Check if Provisioning Role exist and provision
    this.rootDomainDzProvisioningRoleArn = `arn:aws:iam::${this.account}:role/service-role/AmazonDataZoneProvisioning-${this.account}`;


    this.manageProjectMembershipCustomResource =
      this.manageProjectMembershipCustomResourceProvider(
        props.applicationName,
      );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/DzBlueprintBucket/Resource`,
      [
        {
          id: 'AwsSolutions-S1',
          reason: ' The S3 Bucket does not require server access logs',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/ProjectMembershipManagerCustomResource/framework-onEvent/Resource`,
      [
        {
          id: 'AwsSolutions-L1',
          reason: 'The lambda version not controllable from Provider',
        },
      ],
    );
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/ProjectMembershipManager-CustomResourceRole/PolicyDzHelperStackProjectMembershipManagerCustomResourceRole301E2816/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Custom resource uses CDK execution role',
        },
      ],
    );
  }

  private createDzBlueprintBucket() {
    const bucketIdentifier = 'DzBlueprintBucket';
    const bucketName = `amazon-datazone-${this.account}-${this.region}-resilience-cdk`;
    return CommonUtils.createS3Bucket(this, bucketIdentifier, bucketName);
  }


  private manageProjectMembershipCustomResourceProvider(
    applicationName: string
  ) {
    const lambdaName = 'ProjectMembershipManager';
    const lambdaHandler = 'project_membership_manager.lambda_handler';
    const lambdaProperties = CommonUtils.getLambdaCoreProperties();

    const lambdaFunction = new lambda.Function(this, lambdaName + 'Lambda', {
      code: lambda.Code.fromAsset(
        path.join(
          __dirname,
          '../src/lambda-functions/project_membership_manager',
        ),
      ),
      role: iam.Role.fromRoleArn(
        this,
        'LambdaProjectMembershipManagerRole',
        CDK_EXEC_ROLE_ARN,
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
      },
      handler: lambdaHandler,
      ...lambdaProperties,
    });

    return new cr.Provider(this, lambdaName + 'CustomResource', {
      onEventHandler: lambdaFunction,
      logGroup: new LogGroup(
        this,
        `${applicationName}-${lambdaName}-CustomResourceLogs`,
        { retention: RetentionDays.ONE_MONTH },
      ),
      role: iam.Role.fromRoleArn(
        this,
        `${lambdaName}-CustomResourceRole`,
        CDK_EXEC_ROLE_ARN,
      ),
    });
  }

}
