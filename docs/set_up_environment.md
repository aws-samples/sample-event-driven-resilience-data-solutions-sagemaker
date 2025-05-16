# Set up environment

Implement the following steps in your local development environment (Linux or macOS).

1. Clone the repository.

```bash
git clone https://github.com/aws-samples/event-driven-resilience-sagemaker-unified-studio.git

cd event-driven-resilience-sagemaker-unified-studio
```

2.	Export AWS credentials to your development environment for the IAM role with administrative permissions, use the following format
```bash
export AWS_ACCESS_KEY_ID=
export AWS_SECRET_ACCESS_KEY=
export AWS_SESSION_TOKEN=
```

3. CDK bootstrap the Central Governance Account.

```bash
cdk bootstrap aws://<AWS_ACCOUNT_ID>/<AWS_REGION>
```


