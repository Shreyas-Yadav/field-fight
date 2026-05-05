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

output "route53_zone_id" {
  description = "Route53 hosted zone ID for the base domain."
  value       = try(aws_route53_zone.primary[0].zone_id, null)
}

output "route53_name_servers" {
  description = "Route53 nameservers to configure at the domain registrar."
  value       = try(aws_route53_zone.primary[0].name_servers, [])
}

output "frontend_certificate_arn" {
  description = "ACM certificate ARN for the frontend hostname."
  value       = try(aws_acm_certificate.frontend[0].arn, null)
}

output "frontend_hostname" {
  description = "Public frontend hostname."
  value       = var.frontend_hostname
}

output "grafana_certificate_arn" {
  description = "ACM certificate ARN for the Grafana hostname."
  value       = try(aws_acm_certificate.grafana[0].arn, null)
}

output "grafana_hostname" {
  description = "Public Grafana hostname."
  value       = var.grafana_hostname
}
