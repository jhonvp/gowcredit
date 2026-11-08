output "bucket_name" { value = aws_s3_bucket.documents.bucket }
output "bucket_arn" { value = aws_s3_bucket.documents.arn }
output "queue_name" { value = aws_sqs_queue.extract.name }
output "queue_arn" { value = aws_sqs_queue.extract.arn }
output "queue_url" { value = aws_sqs_queue.extract.url }
output "dlq_arn" { value = aws_sqs_queue.extract_dlq.arn }
output "secret_arns" { value = { for k, s in aws_secretsmanager_secret.app : k => s.arn } }
