# Managed by the packer-build GitHub Actions workflow.
# Empty = Terraform resolves the latest EKS-optimized AMI from AWS SSM.
# Set to a Packer-built AMI ID to pin nodes to a patched golden image.
eks_node_ami_id = "ami-0b54e3ab9e03ccf57"
