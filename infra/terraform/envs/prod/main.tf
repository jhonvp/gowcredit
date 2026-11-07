# Production on AWS (ADR 0006). State in S3 (partial backend config):
#   terraform init -backend-config="bucket=<state-bucket>" -backend-config="key=gowcredit/prod.tfstate" -backend-config="region=us-east-1"
#   terraform apply -var image_tag=<git sha> -var smtp_url=... (see docs/deploy.md)
terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { app = "gowcredit", env = "prod", managed_by = "terraform" }
  }
}

locals {
  name = "gowcredit-prod"
}

module "network" {
  source = "../../modules/network"
  name   = local.name
}

module "storage" {
  source         = "../../modules/storage"
  name           = local.name
  retention_days = var.document_retention_days
}

module "database" {
  source                = "../../modules/database"
  name                  = local.name
  vpc_id                = module.network.vpc_id
  subnet_ids            = module.network.private_subnet_ids
  app_security_group_id = module.app.app_security_group_id
}

module "app" {
  source             = "../../modules/app"
  name               = local.name
  environment        = "prod"
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  private_subnet_ids = module.network.private_subnet_ids
  image_tag          = var.image_tag
  bucket_name        = module.storage.bucket_name
  bucket_arn         = module.storage.bucket_arn
  queue_name         = module.storage.queue_name
  queue_arn          = module.storage.queue_arn
  secret_arns        = module.storage.secret_arns
  db_host            = module.database.endpoint
  db_secret_arn      = module.database.master_secret_arn
  smtp_url           = var.smtp_url
  mail_from          = var.mail_from
  web_base_url       = module.web.url
}

module "web" {
  source            = "../../modules/web"
  name              = local.name
  api_origin_domain = module.app.alb_dns_name
}

# Sending identity for the clarification emails (Nodemailer → SES SMTP).
resource "aws_sesv2_email_identity" "mail" {
  email_identity = var.mail_domain
}
