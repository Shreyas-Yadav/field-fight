variable "aws_region" {
  description = "AWS region for the dev environment."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used in resource names."
  type        = string
  default     = "field-fight"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "az_count" {
  description = "Number of availability zones to use."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the dev VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "enable_nat_gateway" {
  description = "Create NAT Gateway so private subnets can reach the internet."
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use one NAT Gateway for cost control in dev."
  type        = bool
  default     = true
}

variable "db_name" {
  description = "Initial Postgres database name."
  type        = string
  default     = "fieldfight"
}

variable "db_username" {
  description = "RDS master username."
  type        = string
  default     = "fieldfight"
}

variable "db_password" {
  description = "RDS master password. Pass this through a local tfvars file or TF_VAR_db_password."
  type        = string
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class for dev."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Initial RDS storage in GB."
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum autoscaled RDS storage in GB."
  type        = number
  default     = 50
}

variable "postgres_engine_version" {
  description = "Postgres engine version."
  type        = string
  default     = "16.8"
}

variable "postgres_major_engine_version" {
  description = "Postgres major engine version."
  type        = string
  default     = "16"
}

variable "postgres_parameter_group_family" {
  description = "Postgres parameter group family."
  type        = string
  default     = "postgres16"
}

variable "db_backup_retention_period" {
  description = "RDS backup retention period in days."
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ RDS. Keep false for lower-cost dev."
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Protect RDS from accidental deletion."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip final snapshot when deleting dev RDS."
  type        = bool
  default     = true
}

variable "create_eks" {
  description = "Create EKS cluster and node group. Requires existing LabRole-compatible IAM role ARNs."
  type        = bool
  default     = false
}

variable "eks_cluster_role_arn" {
  description = "Existing IAM role ARN for the EKS control plane, for example LabRole if the lab allows it."
  type        = string
  default     = null
}

variable "eks_node_role_arn" {
  description = "Existing IAM role ARN for EKS worker nodes, for example LabRole if the lab allows it."
  type        = string
  default     = null
}

variable "eks_cluster_version" {
  description = "Kubernetes version for EKS."
  type        = string
  default     = "1.35"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for the default EKS managed node group."
  type        = list(string)
  default     = ["t3.small"]
}

variable "eks_node_min_size" {
  description = "Minimum EKS node count."
  type        = number
  default     = 1
}

variable "eks_node_desired_size" {
  description = "Desired EKS node count."
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum EKS node count."
  type        = number
  default     = 3
}

variable "install_argocd" {
  description = "Install Argo CD into the EKS cluster."
  type        = bool
  default     = false
}

variable "argocd_chart_version" {
  description = "Argo CD Helm chart version."
  type        = string
  default     = "9.5.11"
}

variable "gitops_repo_url" {
  description = "Git repository URL that Argo CD should watch."
  type        = string
  default     = "https://github.com/Shreyas-Yadav/field-fight.git"
}

variable "gitops_target_revision" {
  description = "Git revision that Argo CD should sync."
  type        = string
  default     = "main"
}

variable "tags" {
  description = "Additional tags to apply to resources."
  type        = map(string)
  default     = {}
}
