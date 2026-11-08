# Documents bucket, extraction queue + DLQ, and application secrets (ADR 0006).
# Shared by envs/local (Floci) and envs/prod (AWS).

resource "aws_s3_bucket" "documents" {
  bucket        = "${var.name}-documents"
  force_destroy = var.force_destroy
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  count  = var.kms_key_arn == null ? 0 : 1
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  count  = var.retention_days == null ? 0 : 1
  bucket = aws_s3_bucket.documents.id
  rule {
    id     = "expire-documents"
    status = "Enabled"
    filter {}
    expiration {
      days = var.retention_days
    }
  }
}

resource "aws_sqs_queue" "extract_dlq" {
  name                      = "${var.name}-extract-dlq"
  message_retention_seconds = 14 * 24 * 3600
  tags                      = var.tags
}

# Visibility timeout must exceed the slowest extraction (T4 agent); redrive after 5 receives.
resource "aws_sqs_queue" "extract" {
  name                       = "${var.name}-extract"
  visibility_timeout_seconds = var.visibility_timeout_seconds
  receive_wait_time_seconds  = 10
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.extract_dlq.arn
    maxReceiveCount     = 5
  })
  tags = var.tags
}

# Values are set out of band (CLI / console), never in Terraform state.
resource "aws_secretsmanager_secret" "app" {
  for_each                = toset(["jwt-secret", "anthropic-api-key", "datadog-api-key"])
  name                    = "${var.name}/${each.key}"
  recovery_window_in_days = var.secret_recovery_days
  tags                    = var.tags
}
