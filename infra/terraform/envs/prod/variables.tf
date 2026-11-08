variable "region" {
  type    = string
  default = "us-east-1"
}
variable "image_tag" {
  description = "Image tag pushed to ECR by the deploy workflow (git sha)"
  type        = string
}
variable "smtp_url" {
  description = "SES SMTP URL with credentials"
  type        = string
  sensitive   = true
}
variable "mail_from" {
  type    = string
  default = "GowCredit <no-reply@gowcredit.mx>"
}
variable "mail_domain" {
  type    = string
  default = "gowcredit.mx"
}
variable "document_retention_days" {
  description = "Delete uploaded documents after N days (data minimization)"
  type        = number
  default     = 365
}
