#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

set -a
source .env
set +a

./delete_app_stack.sh

aws sns delete-topic --topic-arn "$SNS_TOPIC_ARN" --region "$AWS_REGION"
aws ssm delete-parameter --name "$GEMINI_KEY_PARAM" --region "$AWS_REGION"

echo "Deleted the application stack, SNS topic, and Gemini SSM parameter."
