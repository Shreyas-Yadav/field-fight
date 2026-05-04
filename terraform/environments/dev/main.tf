data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "${var.project_name}-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, var.az_count)

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Phase       = "core-infra"
    },
    var.tags,
  )
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name
  cidr = var.vpc_cidr

  azs              = local.azs
  public_subnets   = [for index, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, index)]
  private_subnets  = [for index, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, index + 4)]
  database_subnets = [for index, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, index + 8)]

  enable_dns_hostnames = true
  enable_dns_support   = true

  enable_nat_gateway = var.enable_nat_gateway
  single_nat_gateway = var.single_nat_gateway

  create_database_subnet_group = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }

  tags = local.common_tags
}

module "rds_security_group" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "${local.name}-postgres"
  description = "Allow Postgres traffic from inside the ${local.name} VPC"
  vpc_id      = module.vpc.vpc_id

  ingress_cidr_blocks = [var.vpc_cidr]
  ingress_rules       = ["postgresql-tcp"]
  egress_rules        = ["all-all"]

  tags = local.common_tags
}

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "${local.name}-postgres"

  engine               = "postgres"
  engine_version       = var.postgres_engine_version
  family               = var.postgres_parameter_group_family
  major_engine_version = var.postgres_major_engine_version
  instance_class       = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password
  port     = 5432

  manage_master_user_password = false

  multi_az               = var.db_multi_az
  publicly_accessible    = false
  vpc_security_group_ids = [module.rds_security_group.security_group_id]

  create_db_subnet_group = false
  db_subnet_group_name   = module.vpc.database_subnet_group_name

  backup_retention_period = var.db_backup_retention_period
  deletion_protection     = var.db_deletion_protection
  skip_final_snapshot     = var.db_skip_final_snapshot

  performance_insights_enabled = false
  monitoring_interval          = 0

  tags = local.common_tags
}

resource "aws_eks_cluster" "this" {
  count = var.create_eks ? 1 : 0

  name     = "${local.name}-eks"
  role_arn = var.eks_cluster_role_arn
  version  = var.eks_cluster_version

  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
  }

  vpc_config {
    endpoint_public_access = true
    subnet_ids             = module.vpc.private_subnets
  }

  tags = local.common_tags
}

resource "aws_eks_node_group" "default" {
  count = var.create_eks ? 1 : 0

  cluster_name    = aws_eks_cluster.this[0].name
  node_group_name = "${local.name}-default"
  node_role_arn   = var.eks_node_role_arn
  subnet_ids      = module.vpc.private_subnets

  instance_types = var.eks_node_instance_types
  capacity_type  = "ON_DEMAND"

  scaling_config {
    min_size     = var.eks_node_min_size
    max_size     = var.eks_node_max_size
    desired_size = var.eks_node_desired_size
  }

  tags = local.common_tags
}
