variable "name" {
  description = "Prefix for every resource, e.g. gowcredit-prod"
  type        = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
variable "force_destroy" {
  description = "Allow deleting a non-empty bucket (local only)"
  type        = bool
  default     = false
}
variable "kms_key_arn" {
  description = "KMS key for SSE; null keeps the S3 default encryption (SSE-S3)"
  type        = string
  default     = null
}
variable "retention_days" {
  description = "Delete stored documents after N days; null keeps them"
  type        = number
  default     = null
}
variable "visibility_timeout_seconds" {
  type    = number
  default = 300
}
variable "secret_recovery_days" {
  type    = number
  default = 7
}
