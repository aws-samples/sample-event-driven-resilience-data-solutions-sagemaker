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
    SMUS_DOMAIN_ID,
    SMUS_PROJECT_ID,
    SMUS_APPLICATION_NAME,
    SMUS_SECONDARY_REGION,
    SMUS_BACKUP_INTERVAL_MINUTES,
} from '../config/Config';
import { SmusBackupStack } from '../lib/SmusBackupStack';
import { Aspects, Tags } from 'aws-cdk-lib';
import { SmusEncryptionStack } from "../lib/SmusEncryptionStack";
import {SmusSecondaryRegionStack} from "../lib/SmusSecondaryRegionStack";

const app = new cdk.App();
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
Tags.of(app).add('ApplicationName', SMUS_APPLICATION_NAME);


const smusEncryptionStack = new SmusEncryptionStack(
    app,
    'SmusEncryptionStack',
    {
        env: {
            region: process.env.AWS_REGION,
        },
        applicationName: SMUS_APPLICATION_NAME,
        description: 'DynamoDB Encryption stack',
        crossRegionReferences: true
    },
);

const smusSecondaryRegionStack = new SmusSecondaryRegionStack(app, 'SmusEncryptionStack-Replica', {
    env: {
        region: SMUS_SECONDARY_REGION
    },
    applicationName: SMUS_APPLICATION_NAME,
    description: 'DynamoDB Encryption stack Replica',
    primaryKeyArn: smusEncryptionStack.dynamoDBEncryptionKey.keyArn,
    crossRegionReferences: true
});
smusSecondaryRegionStack.addDependency(smusEncryptionStack);

const smusBackupStack = new SmusBackupStack(app, 'SmusBackupStack', {
    env: {
        region: process.env.AWS_REGION,
    },
    applicationName: SMUS_APPLICATION_NAME,
    domainIdentifier: SMUS_DOMAIN_ID,
    projectIdentifier: SMUS_PROJECT_ID,
    secondaryRegion: SMUS_SECONDARY_REGION,
    backupIntervalMinutes: SMUS_BACKUP_INTERVAL_MINUTES,
    primaryDynamoDBEncryptionKey: smusEncryptionStack.dynamoDBEncryptionKey,
    secondaryDynamoDBEncryptionKeyArn: smusSecondaryRegionStack.secondaryDynamoDBEncryptionKeyArn,
    description: 'SageMaker Unifed Studio domain based data solution backup stack',
    crossRegionReferences: true
});



