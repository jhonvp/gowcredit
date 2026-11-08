variable "name" { type = string }
variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "image_tag" { type = string }
variable "bucket_name" { type = string }
variable "bucket_arn" { type = string }
variable "queue_name" { type = string }
variable "queue_arn" { type = string }
variable "secret_arns" { type = map(string) }
variable "db_host" { type = string }
variable "db_secret_arn" { type = string }
variable "smtp_url" {
  description = "SES SMTP endpoint with credentials, e.g. smtps://user:pass@email-smtp.us-east-1.amazonaws.com:465"
  type        = string
  sensitive   = true
}
variable "mail_from" { type = string }
variable "web_base_url" { type = string }
variable "llm_mode" {
  type    = string
  default = "live"
}
variable "datadog_site" {
  type    = string
  default = "datadoghq.com"
}
variable "api_count" {
  type    = number
  default = 2
}
variable "worker_max" {
  type    = number
  default = 6
}
variable "tags" {
  type    = map(string)
  default = {}
}
