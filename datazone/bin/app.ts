#!/usr/bin/env node
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
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import {
    DZ_PROJECT_NAME,
    DZ_PROJECT_DESCRIPTION,
    DZ_APPLICATION_NAME,
    DZ_SECONDARY_REGION,
    DZ_DOMAIN_DESCRIPTION,
    DZ_DOMAIN_NAME,
    DZ_DOMAIN_TAG,
    DZ_STAGE_NAME,
    DZ_BACKUP_INTERVAL_MINUTES,
} from '../config/Config';
import { DzDomainStack } from '../lib/DzDomainStack';
import { DzHelperStack } from '../lib/DzHelperStack';
import { DzDomainInfraStack } from '../lib/DzDomainInfraStack';
import { DzEncryptionStack } from '../lib/DzEncryptionStack';
import { DzBackupStack } from '../lib/DzBackupStack';
import { Aspects, Tags } from 'aws-cdk-lib';
import {DzSecondaryRegionStack} from "../lib/DzSecondaryRegionStack";

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

Tags.of(app).add('ApplicationName', DZ_APPLICATION_NAME);
Tags.of(app).add('ApplicationId', 'acmecorp-app-1234');
Tags.of(app).add('PersonalData', 'false');


const dzEncryptionStack = new DzEncryptionStack(
  app,
  'DzEncryptionStack',
  {
   env: {
       region: process.env.AWS_REGION,
    },
    applicationName: DZ_APPLICATION_NAME,
    description: 'DataZone Domain Encryption stack',
    crossRegionReferences: true
  },
);

const dzSecondaryRegionStack = new DzSecondaryRegionStack(app, 'DzEncryptionStack-Replica', {
    env: {
        region: DZ_SECONDARY_REGION
    },
    applicationName: DZ_APPLICATION_NAME,
    description: 'DataZone Domain Encryption stack Replica',
    primaryKeyArn: dzEncryptionStack.dynamoDBEncryptionKey.keyArn,
    crossRegionReferences: true
});
dzSecondaryRegionStack.addDependency(dzEncryptionStack);

const dzDataMeshHelperStack = new DzHelperStack(
    app,
    'DzHelperStack',
    {
        env: {
            region: process.env.AWS_REGION,
        },
        applicationName: DZ_APPLICATION_NAME,
        stageName: DZ_STAGE_NAME,
        description: 'DataZone Infrastructure Helper stack',
        crossRegionReferences: true
    },
);

const dzDomainStack = new DzDomainStack(app, 'DzDomainStack', {
  env: {
      region: process.env.AWS_REGION,
  },
  applicationName: DZ_APPLICATION_NAME,
  domainDescription: DZ_DOMAIN_DESCRIPTION,
  domainName: DZ_DOMAIN_NAME,
  domainTag: DZ_DOMAIN_TAG,
  projectName: DZ_PROJECT_NAME,
  stageName: DZ_STAGE_NAME,
  projectDescription: DZ_PROJECT_DESCRIPTION,
  domainKMSKey: dzEncryptionStack.encryptionKey,
  description: 'DataZone Domain stack',
  crossRegionReferences: true
});


const dzDomainInfraStack = new DzDomainInfraStack(
  app,
  'DzDomainInfraStack',
  {
   env: {
       region: process.env.AWS_REGION,
   },
    applicationName: DZ_APPLICATION_NAME,
    domainDescription: DZ_DOMAIN_DESCRIPTION,
    domainName: DZ_DOMAIN_NAME,
    domainId: dzDomainStack.domainId,
    domainTag: DZ_DOMAIN_TAG,
    projectName: DZ_PROJECT_NAME,
    stageName: DZ_STAGE_NAME,
    projectDescription: DZ_PROJECT_DESCRIPTION,
    domainKMSKey: dzDataMeshHelperStack.encryptionKey,
    rootDomainDzProvisioningRoleArn:
      dzDataMeshHelperStack.rootDomainDzProvisioningRoleArn,
    rootDomainBlueprintBucketName:
      dzDataMeshHelperStack.rootDomainBlueprintBucketName,
    manageProjectMembershipCustomResource:
      dzDataMeshHelperStack.manageProjectMembershipCustomResource,
    manageGlossaryCustomResource:
      dzDataMeshHelperStack.manageGlossaryCustomResource,
    manageMetadataFormCustomResource:
      dzDataMeshHelperStack.manageMetadataFormCustomResource,
    description: 'DataZone Domain Infrastructure stack',
    crossRegionReferences: true
  },
);
dzDomainInfraStack.addDependency(dzDomainStack);


const dzBackupStack = new DzBackupStack(app, 'DzBackupStack', {
    env: {
        region: process.env.AWS_REGION,
    },
    applicationName: DZ_APPLICATION_NAME,
    stageName: DZ_STAGE_NAME,
    domainIdentifier: dzDomainStack.domainId,
    projectName: DZ_PROJECT_NAME,
    projectIdentifier: dzDomainInfraStack.projectId,
    secondaryRegion: DZ_SECONDARY_REGION,
    backupIntervalMinutes: DZ_BACKUP_INTERVAL_MINUTES,
    datameshEncryptionKey: dzEncryptionStack.encryptionKey,
    primaryDynamoDBEncryptionKey: dzEncryptionStack.dynamoDBEncryptionKey,
    secondaryDynamoDBEncryptionKeyArn: dzSecondaryRegionStack.secondaryDynamoDBEncryptionKeyArn,
    manageProjectMembershipCustomResource:
      dzDataMeshHelperStack.manageProjectMembershipCustomResource,
    description: 'DataZone based data solution backup stack',
    crossRegionReferences: true
});



