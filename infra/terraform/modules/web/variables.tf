variable "name" { type = string }
variable "api_origin_domain" {
  description = "DNS name of the API load balancer"
  type        = string
}
variable "tags" {
  type    = map(string)
  default = {}
}
