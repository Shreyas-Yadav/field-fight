output "state_bucket_name" {
  description = "S3 bucket that stores Terraform remote state."
  value       = module.state_bucket.s3_bucket_id
}

output "lock_table_name" {
  description = "DynamoDB table used for Terraform state locking."
  value       = module.lock_table.dynamodb_table_id
}

output "backend_config" {
  description = "Backend settings to use when initializing environment Terraform stacks."
  value = {
    bucket         = module.state_bucket.s3_bucket_id
    dynamodb_table = module.lock_table.dynamodb_table_id
    region         = var.aws_region
    encrypt        = true
  }
}
