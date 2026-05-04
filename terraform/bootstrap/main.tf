data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  state_bucket_name = coalesce(
    var.state_bucket_name,
    "${local.name_prefix}-terraform-state-${data.aws_caller_identity.current.account_id}-${var.aws_region}",
  )

  lock_table_name = coalesce(
    var.lock_table_name,
    "${local.name_prefix}-terraform-locks",
  )

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Phase       = "bootstrap"
    },
    var.tags,
  )
}

module "state_bucket" {
  source  = "terraform-aws-modules/s3-bucket/aws"
  version = "~> 4.0"

  bucket        = local.state_bucket_name
  force_destroy = var.force_destroy_state_bucket

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true

  control_object_ownership = true
  object_ownership         = "BucketOwnerEnforced"

  attach_deny_insecure_transport_policy = true

  versioning = {
    enabled = true
  }

  server_side_encryption_configuration = {
    rule = {
      apply_server_side_encryption_by_default = {
        sse_algorithm = "AES256"
      }
    }
  }

  tags = local.common_tags
}

module "lock_table" {
  source  = "terraform-aws-modules/dynamodb-table/aws"
  version = "~> 4.0"

  name         = local.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attributes = [
    {
      name = "LockID"
      type = "S"
    },
  ]

  deletion_protection_enabled    = var.enable_deletion_protection
  point_in_time_recovery_enabled = true

  tags = local.common_tags
}
