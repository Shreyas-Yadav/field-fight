# ECR Repositories

This Terraform stack uses `terraform-aws-modules/ecr/aws` to create one immutable ECR repository per deployable image:

- `frontend`
- `game-server`
- `leaderboard-api`
- `auth-service`
- `match-history-service`
- `migrations`

Run it before enabling the GitHub Actions publish job:

```sh
cd terraform/ecr
terraform init
terraform plan
terraform apply
```

The default region is `us-east-1`, and the repository names must match the GitHub Actions `ECR_REPOSITORY_PREFIX` variable. With the defaults, the workflow publishes images such as:

```text
field-fight-frontend:<commit-sha>
field-fight-game-server:<commit-sha>
```
