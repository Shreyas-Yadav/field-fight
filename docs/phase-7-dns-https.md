# Phase 7: DNS and HTTPS

Phase 7 exposes the dev app through a public HTTPS hostname:

```text
https://field-fight-dev.shri.software
```

## DNS Delegation

The domain `shri.software` is registered at name.com. Terraform creates a
Route53 public hosted zone and outputs the nameservers that need to be configured
at name.com.

Apply the DNS zone and certificate request first:

```sh
export TF_VAR_db_password='<your-db-password>'

terraform apply \
  -var='create_eks=true' \
  -var='install_argocd=true' \
  -var='create_route53_zone=true' \
  -var='create_frontend_certificate=true' \
  -var='eks_cluster_role_arn=arn:aws:iam::272772901676:role/LabRole' \
  -var='eks_node_role_arn=arn:aws:iam::272772901676:role/LabRole'
```

Copy `route53_name_servers` into name.com for `shri.software`.

## Certificate Validation

After name.com delegates the domain to Route53, validate the ACM certificate:

```sh
export TF_VAR_db_password='<your-db-password>'

terraform apply \
  -var='create_eks=true' \
  -var='install_argocd=true' \
  -var='create_route53_zone=true' \
  -var='create_frontend_certificate=true' \
  -var='validate_frontend_certificate=true' \
  -var='eks_cluster_role_arn=arn:aws:iam::272772901676:role/LabRole' \
  -var='eks_node_role_arn=arn:aws:iam::272772901676:role/LabRole'
```

Use `frontend_certificate_arn` in `gitops/environments/dev/values.yaml`, then
set `ingress.enabled` to `true` and push the change.

## Load Balancer Controller

Install AWS Load Balancer Controller through Terraform:

```sh
export TF_VAR_db_password='<your-db-password>'

terraform apply \
  -var='create_eks=true' \
  -var='install_argocd=true' \
  -var='create_route53_zone=true' \
  -var='create_frontend_certificate=true' \
  -var='validate_frontend_certificate=true' \
  -var='install_aws_load_balancer_controller=true' \
  -var='eks_cluster_role_arn=arn:aws:iam::272772901676:role/LabRole' \
  -var='eks_node_role_arn=arn:aws:iam::272772901676:role/LabRole'
```

Argo CD will sync the frontend Ingress after the GitOps values are pushed.

## Final DNS Alias

After the Ingress shows an ALB hostname, get the ALB DNS name and hosted zone ID,
then run Terraform with:

```text
-var='frontend_alb_dns_name=<alb-dns-name>'
-var='frontend_alb_zone_id=<alb-zone-id>'
```

Terraform will create the Route53 alias record for
`field-fight-dev.shri.software`.

## OAuth Callback URLs

Configure OAuth providers with these callback URLs when OAuth credentials are
ready:

```text
https://field-fight-dev.shri.software/auth/github/callback
https://field-fight-dev.shri.software/auth/google/callback
```
