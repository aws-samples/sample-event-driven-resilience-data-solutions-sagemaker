"""
Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
SPDX-License-Identifier: MIT-0

Permission is hereby granted, free of charge, to any person obtaining a copy of this
software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

This Lambda function registers data assets for a data solution built on Amazon DataZone.

Environment Variables:
    LOG_LEVEL (str): The log level for the function (e.g., "INFO", "DEBUG", "WARNING").
    TRACER_DISABLED (bool): Whether to disable the AWS X-Ray tracer.

Functions:
    lambda_handler(event, context): The entry point for the Lambda function.


"""
import os
from aws_lambda_powertools import Logger
from aws_lambda_powertools import Tracer
from boto3.session import Session

def get_logger(log_level: str = "INFO", service_name: str = "") -> Logger:
    """Initialize Logger"""
    logger = Logger(level=log_level, service=f"ds_{service_name}")
    logger.info("Logger started...")
    return logger


def get_tracer(tracer_disabled: bool = False, service_name: str = "") -> Tracer:
    """Initialize Tracer"""
    tracer = Tracer(service=f"cls_{service_name}", disabled=tracer_disabled)
    return tracer


def get_session() -> Session:
    """Return boto3 execution session"""
    boto3_session = Session()
    return boto3_session

# Set logger, tracer, and session
log_level = os.environ.get("LOG_LEVEL", "INFO")
tracer_disabled = os.environ.get("TRACER_DISABLED", False)
logger = get_logger(log_level=log_level, service_name="dz_assets_registrar")
tracer = get_tracer(tracer_disabled=tracer_disabled, service_name="dz_assets_registrar")
session = get_session()

# Initiate clients and resources
dz_client = session.client("datazone")
ddb_resource = session.resource("dynamodb")

# Get environment variables
dz_domain_id = os.environ.get("DZ_DOMAIN_ID")
dz_project_id = os.environ.get("DZ_PROJECT_ID")
dz_state_store_table_arn =  os.environ.get("DZ_STATE_STORE_TABLE_ARN")
dz_state_store_table_name = dz_state_store_table_arn.split("/")[-1]


def write_to_state_store(table, asset_item):
    logger.info(f"Writing asset {asset_item['name']} to state store")
    logger.info(f"dz_state_store_table_arn: {dz_state_store_table_arn}")
    logger.info(f"dz_state_store_table_name: {dz_state_store_table_name}")
    logger.info(f"Writing asset to {table} to state store")
    try:
        table.put_item(
            Item={
                'AssetId': asset_item['identifier'],
                'AssetType': asset_item['typeIdentifier'],
                'AssetName': asset_item['name'],
                'ExternalIdentifier': asset_item['externalIdentifier'],
                'CreationDate': asset_item['createdAt'].isoformat(),
                'FirstRevisionCreatedAt': asset_item['firstRevisionCreatedAt'].isoformat()
            }
        )
        logger.info(f"Successfully wrote asset {asset_item['identifier']} to state store")
    except Exception as e:
        logger.error(f"Error writing asset to state store: {str(e)}")
        raise e

def lambda_handler(event, context):
    table = ddb_resource.Table(dz_state_store_table_name)
    all_assets = []
    logger.info(f"DataZone domain id: {dz_domain_id}")
    logger.info(f"DataZone project id: {dz_project_id}")

    paginator = dz_client.get_paginator('search')

    try:
        for page in paginator.paginate(
                domainIdentifier=dz_domain_id,
                owningProjectIdentifier=dz_project_id,
                searchScope='ASSET',
        ):
            if 'items' in page:
                logger.info(f"results = {page} results in this page")
                logger.info(f"Found {len(page['items'])} results in this page")
                all_assets.extend(page['items'])
                for item in page['items']:
                    asset_item = item['assetItem']
                    write_to_state_store(table, asset_item)
            else:
                logger.info(f"results = {page} No searchResults found in page")
                logger.warning("No searchResults found in page")

        logger.info(f"Total assets found: {len(all_assets)}")
    except Exception as e:
        logger.error(f"Error during pagination: {str(e)}")
        raise e


