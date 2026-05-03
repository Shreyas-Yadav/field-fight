locals {
  common_tags = merge(
    {
      Project   = var.project_name
      ManagedBy = "terraform"
      Phase     = "image-build"
    },
    var.tags,
  )

  untagged_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}

module "ecr" {
  source  = "terraform-aws-modules/ecr/aws"
  version = "3.2.0"

  for_each = var.services

  repository_name                 = "${var.project_name}-${each.key}"
  repository_type                 = "private"
  repository_image_tag_mutability = "IMMUTABLE"
  repository_image_scan_on_push   = true
  repository_encryption_type      = "AES256"
  repository_force_delete         = var.force_delete
  repository_lifecycle_policy     = local.untagged_lifecycle_policy

  attach_repository_policy = false
  create_repository_policy = false

  tags = merge(local.common_tags, {
    Service = each.key
  })
}
