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
import { Construct } from 'constructs';
import {
  DZ_ADMIN_ROLE_ARN,
} from '../config/Config';

interface DzSecondaryRegionStackProps extends cdk.StackProps {
  applicationName: string;
  primaryKeyArn: string;
}

export class DzSecondaryRegionStack extends cdk.Stack {
  public readonly secondaryDynamoDBEncryptionKeyArn: string;
  constructor(scope: Construct, id: string, props: DzSecondaryRegionStackProps) {
    super(scope, id, props);

    this.secondaryDynamoDBEncryptionKeyArn = this.createSecondaryDynamoDBEncryptionKey(props).attrArn;
  }

    private createSecondaryDynamoDBEncryptionKey(props: DzSecondaryRegionStackProps) {
        return new kms.CfnReplicaKey(
            this,
            `${props.applicationName}dynamoDBReplicaEncryptionKey`,
            {
                primaryKeyArn: props.primaryKeyArn,
                keyPolicy: {
                    'Version': '2012-10-17',
                    'Statement': [
                        {
                            'Effect': 'Allow',
                            'Principal': {
                                'AWS': `arn:aws:iam::${this.account}:root`
                            },
                            'Action': 'kms:*',
                            'Resource': '*',
                        },
                        {
                            'Effect': 'Allow',
                            'Principal': {
                                'AWS': DZ_ADMIN_ROLE_ARN,
                            },
                            'Action': 'kms:*',
                            'Resource': '*',
                        },
                    ],
                },
            },
        );
    }

}
