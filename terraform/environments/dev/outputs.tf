output "vpc_id" {
  description = "Dev VPC ID."
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "Public subnet IDs."
  value       = module.vpc.public_subnets
}

output "private_subnet_ids" {
  description = "Private subnet IDs."
  value       = module.vpc.private_subnets
}

output "database_subnet_ids" {
  description = "Database subnet IDs."
  value       = module.vpc.database_subnets
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint."
  value       = module.rds.db_instance_endpoint
}

output "rds_database_name" {
  description = "RDS database name."
  value       = module.rds.db_instance_name
}

output "eks_cluster_name" {
  description = "EKS cluster name when EKS is enabled."
  value       = try(aws_eks_cluster.this[0].name, null)
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint when EKS is enabled."
  value       = try(aws_eks_cluster.this[0].endpoint, null)
  sensitive   = true
}
