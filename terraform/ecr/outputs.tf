output "repository_names" {
  description = "ECR repository names by service."
  value = {
    for service, repo in module.ecr : service => repo.repository_name
  }
}

output "repository_urls" {
  description = "ECR repository URLs by service."
  value = {
    for service, repo in module.ecr : service => repo.repository_url
  }
}
