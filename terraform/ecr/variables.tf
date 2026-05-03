variable "aws_region" {
  description = "AWS region where the ECR repositories will be created."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used for ECR repository names."
  type        = string
  default     = "field-fight"
}

variable "services" {
  description = "Service image repositories to create."
  type        = set(string)
  default = [
    "frontend",
    "game-server",
    "leaderboard-api",
    "auth-service",
    "match-history-service",
    "migrations",
  ]
}

variable "force_delete" {
  description = "Allow Terraform to delete repositories that still contain images. Keep false for shared environments."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to ECR repositories."
  type        = map(string)
  default     = {}
}
