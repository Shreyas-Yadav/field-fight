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

# AL2023 EKS-optimized AMI — the default OS for EKS 1.29+ clusters.
# Naming differs from AL2: uses "al2023-x86_64-standard" infix.
data "amazon-ami" "eks_base" {
  region = var.aws_region
  filters = {
    name                = "amazon-eks-node-al2023-x86_64-standard-${var.eks_version}-*"
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
  ami_name = "field-fight-eks-node-al2023-${var.eks_version}-{{timestamp}}"

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
      # AL2023 uses dnf, not yum. Full update first, then a security-only
      # pass to ensure CVEs released between the two runs are applied.
      "sudo dnf update -y",
      "sudo dnf upgrade -y --security",
      # Bake in htop for node observability — demonstrates golden AMI
      # carries custom tooling beyond security patches.
      "sudo dnf install -y htop",
    ]
  }
}
