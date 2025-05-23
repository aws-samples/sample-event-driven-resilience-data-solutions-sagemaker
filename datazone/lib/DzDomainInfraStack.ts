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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as datazone from 'aws-cdk-lib/aws-datazone';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { CustomResource } from 'aws-cdk-lib';
import { DZ_ADMIN_ROLE_ARN } from '../config/Config';

interface DataZoneProps extends cdk.StackProps {
  domainName: string;
  domainId: string;
  domainDescription: string;
  domainTag: string;
  projectName: string;
  stageName: string;
  projectDescription: string;
  applicationName: string;
  domainKMSKey: kms.Key;
  rootDomainDzProvisioningRoleArn: string;
  rootDomainBlueprintBucketName: string;
  manageProjectMembershipCustomResource: Provider;
  manageGlossaryCustomResource: Provider;
  manageMetadataFormCustomResource: Provider;
}

export class DzDomainInfraStack extends cdk.Stack {
  public readonly projectId: string;
  constructor(scope: Construct, id: string, props: DataZoneProps) {
    super(scope, id, props);

    const domainId = props.domainId;

    const glueManageAccessRole = this.createRootDomainGlueManageAccessRole(
      props,
      domainId,
    );
    const dataLakeBlueprintConfiguration = this.enableDataLakeBlueprint(
      props,
      domainId,
      glueManageAccessRole,
    );
    const adminProject = this.createDzProject(props, domainId);
    this.projectId = adminProject.getAtt('Id').toString();

    const dataLakeBlueprintId =
      dataLakeBlueprintConfiguration.attrEnvironmentBlueprintId;
    const adminProjectId = adminProject.getAtt('Id').toString();
    const createDzEnvironment = this.createDzEnvironment(
      props,
      domainId,
      dataLakeBlueprintId,
      adminProjectId,
    );

    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.node.path}/RootDomainDzGlueManageAccessRole`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'The managed policy is used by the service role of DataZone is maintained by the service',
        },
      ],
    );
  }

  private createRootDomainGlueManageAccessRole(
    props: DataZoneProps,
    domainId: string,
  ) {
      return new iam.CfnRole(
      this,
      'RootDomainDzGlueManageAccessRole',
      {
        assumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                Service: 'datazone.amazonaws.com',
              },
              Action: 'sts:AssumeRole',
              Condition: {
                StringEquals: {
                  'aws:SourceAccount': this.account,
                },
                ArnEquals: {
                  'aws:SourceArn': `arn:aws:datazone:${this.region}:${this.account}:domain/${domainId}`,
                },
              },
            },
          ],
        },
        // Policy is managed by DataZone. Not using custom policies to allow for new features.
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonDataZoneGlueManageAccessRolePolicy',
        ],
        roleName: `AmazonDataZoneGlueAccess-${this.region}-${domainId}`,
      },
    );
  }

  private enableDataLakeBlueprint(
    props: DataZoneProps,
    domainId: string,
    glueManageAccessRole: iam.CfnRole,
  ) {
    const blueprintConfiguration =
      new datazone.CfnEnvironmentBlueprintConfiguration(
        this,
        `DzBlueprintConfiguration- + ${props.domainName}`,
        {
          domainIdentifier: domainId,
          enabledRegions: [this.region],
          environmentBlueprintIdentifier: 'DefaultDataLake',
          manageAccessRoleArn: glueManageAccessRole.attrArn,
          provisioningRoleArn: props.rootDomainDzProvisioningRoleArn,
          regionalParameters: [
            {
              region: this.region,
              parameters: { S3Location: props.rootDomainBlueprintBucketName },
            },
          ],
        },
      );

    return blueprintConfiguration;
  }

  private createDzProject(props: DataZoneProps, domainId: string) {
    const adminProject = new datazone.CfnProject(this, props.projectName, {
      description: props.projectDescription,
      domainIdentifier: domainId,
      name: props.projectName,
    });

    const adminProjectMembershipCustomResource =
      props.manageProjectMembershipCustomResource;

    const adminProjectMembership = new CustomResource(
      this,
      `${props.projectName}-AdminProjectMembership`,
      {
        serviceToken: adminProjectMembershipCustomResource.serviceToken,
        properties: {
          DomainId: domainId,
          ProjectId: adminProject.getAtt('Id').toString(),
          ProjectName: props.projectName,
          Designation: 'PROJECT_OWNER',
          UserIdentifier: DZ_ADMIN_ROLE_ARN,
        },
      },
    );

    adminProjectMembership.node.addDependency(adminProject);

    return adminProject;
  }

  private createDzEnvironment(
    props: DataZoneProps,
    domainId: string,
    dataLakeBlueprintId: string,
    adminProjectId: string,
  ) {
    const adminProjectEnvironmentProfile = new datazone.CfnEnvironmentProfile(
      this,
      `${props.projectName}-DataLakeEnvironmentProfile`,
      {
        awsAccountId: this.account,
        awsAccountRegion: this.region,
        domainIdentifier: domainId,
        environmentBlueprintIdentifier: dataLakeBlueprintId,
        name: `${props.projectName}-DataLakeEnvironmentProfile`,
        projectIdentifier: adminProjectId,
        description: `DataLake environment profile for project ${props.projectName}`,
      },
    );

    const adminProjectEnvironment = new datazone.CfnEnvironment(
      this,
      `${props.projectName}-DataLakeEnvironment`,
      {
        domainIdentifier: domainId,
        environmentProfileIdentifier: adminProjectEnvironmentProfile.attrId,
        name: `${props.projectName}-DataLakeEnvironment`,
        projectIdentifier: adminProjectId,
        description: `DataLake environment for project ${props.projectName}`,
      },
    );

    return adminProjectEnvironmentProfile;
  }

}
