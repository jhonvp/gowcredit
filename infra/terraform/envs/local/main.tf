# Local AWS on Floci (ADR 0006): the same storage module as prod (bucket, queue + DLQ, secrets).
# ECS/RDS/CloudFront are not emulated locally; Docker Compose runs those parts.
#   make tf-local      (Floci must be running: make up, or docker compose up -d floci)
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "floci_endpoint" {
  type    = string
  default = "http://floci:4566"
}

provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    s3             = var.floci_endpoint
    sqs            = var.floci_endpoint
    secretsmanager = var.floci_endpoint
    sts            = var.floci_endpoint
  }
}

module "storage" {
  source               = "../../modules/storage"
  name                 = "gowcredit-local"
  force_destroy        = true
  secret_recovery_days = 0
  tags                 = { env = "local", app = "gowcredit" }
}

output "bucket_name" { value = module.storage.bucket_name }
output "queue_name" { value = module.storage.queue_name }
output "dlq_arn" { value = module.storage.dlq_arn }
