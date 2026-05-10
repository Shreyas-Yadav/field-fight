packer {
  required_plugins {
    amazon = {
      version = ">= 1.3.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "eks_version" {
  description = "EKS Kubernetes version — must match var.eks_cluster_version in Terraform."
  default     = "1.35"
}

variable "aws_region" {
  description = "AWS region where the AMI will be registered."
  default     = "us-east-1"
}

# Resolve the latest EKS-optimized Amazon Linux 2 AMI for the given k8s version.
# Using the official AWS owner ensures the bootstrap script is pre-installed.
data "amazon-ami" "eks_base" {
  region = var.aws_region
  filters = {
    name                = "amazon-eks-node-${var.eks_version}-*"
    root-device-type    = "ebs"
    virtualization-type = "hvm"
    architecture        = "x86_64"
  }
  most_recent = true
  owners      = ["amazon"]
}

source "amazon-ebs" "eks_node" {
  region        = var.aws_region
  source_ami    = data.amazon-ami.eks_base.id
  instance_type = "t3.medium"
  ssh_username  = "ec2-user"

  # Timestamp in the name guarantees immutability — every build is a distinct artifact.
  ami_name = "field-fight-eks-node-${var.eks_version}-{{timestamp}}"

  tags = {
    Name       = "field-fight-eks-node"
    EKSVersion = var.eks_version
    ManagedBy  = "packer"
  }
}

build {
  sources = ["source.amazon-ebs.eks_node"]

  provisioner "shell" {
    inline = [
      # Full OS update first, then security-only pass to catch any CVEs
      # that the initial update may have missed in ordering.
      "sudo yum update -y",
      "sudo yum upgrade -y --security",
    ]
  }
}
