variable "aws_region" {
  description = "AWS region where Terraform state resources will be created."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used in bootstrap resource names."
  type        = string
  default     = "field-fight"
}

variable "environment" {
  description = "Environment name used in bootstrap resource names."
  type        = string
  default     = "shared"
}

variable "state_bucket_name" {
  description = "Optional explicit S3 bucket name for Terraform state."
  type        = string
  default     = null
}

variable "lock_table_name" {
  description = "Optional explicit DynamoDB lock table name."
  type        = string
  default     = null
}

variable "force_destroy_state_bucket" {
  description = "Allow Terraform to delete the state bucket even if objects exist. Keep false for safety."
  type        = bool
  default     = false
}

variable "enable_deletion_protection" {
  description = "Protect the DynamoDB lock table from accidental deletion."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags to apply to bootstrap resources."
  type        = map(string)
  default     = {}
}
