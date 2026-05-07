# Additional environments that share the dev ALB via ingress group annotation.
# Each gets its own ACM cert and Route53 A-record alias.
# The ALB DNS/Zone ID values are set automatically by `recreate-dev.sh finish`
# after the AWS Load Balancer Controller provisions the shared ALB.
additional_environments = [
  { name = "qa", hostname = "field-fight-qa.shri.software" },
  { name = "uat", hostname = "field-fight-uat.shri.software" },
  { name = "prod", hostname = "field-fight.shri.software" },
]
