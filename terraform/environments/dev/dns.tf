resource "aws_route53_zone" "primary" {
  count = var.create_route53_zone ? 1 : 0

  name = var.domain_name

  tags = merge(local.common_tags, {
    Phase = "dns-https"
  })
}

resource "aws_acm_certificate" "frontend" {
  count = var.create_frontend_certificate ? 1 : 0

  domain_name       = var.frontend_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Phase = "dns-https"
  })
}

resource "aws_acm_certificate" "grafana" {
  count = var.create_grafana_certificate ? 1 : 0

  domain_name       = var.grafana_hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Phase = "observability"
  })
}

resource "aws_route53_record" "frontend_certificate_validation" {
  for_each = var.create_route53_zone && var.create_frontend_certificate ? {
    for option in aws_acm_certificate.frontend[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.primary[0].zone_id
}

resource "aws_route53_record" "grafana_certificate_validation" {
  for_each = var.create_route53_zone && var.create_grafana_certificate ? {
    for option in aws_acm_certificate.grafana[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.primary[0].zone_id
}

resource "aws_acm_certificate_validation" "frontend" {
  count = var.validate_frontend_certificate ? 1 : 0

  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for record in aws_route53_record.frontend_certificate_validation : record.fqdn]
}

resource "aws_acm_certificate_validation" "grafana" {
  count = var.validate_grafana_certificate ? 1 : 0

  certificate_arn         = aws_acm_certificate.grafana[0].arn
  validation_record_fqdns = [for record in aws_route53_record.grafana_certificate_validation : record.fqdn]
}

resource "aws_route53_record" "frontend_alias" {
  count = var.create_route53_zone && var.frontend_alb_dns_name != "" && var.frontend_alb_zone_id != "" ? 1 : 0

  name    = var.frontend_hostname
  type    = "A"
  zone_id = aws_route53_zone.primary[0].zone_id

  alias {
    evaluate_target_health = true
    name                   = var.frontend_alb_dns_name
    zone_id                = var.frontend_alb_zone_id
  }
}

resource "aws_route53_record" "grafana_alias" {
  count = var.create_route53_zone && var.grafana_alb_dns_name != "" && var.grafana_alb_zone_id != "" ? 1 : 0

  name    = var.grafana_hostname
  type    = "A"
  zone_id = aws_route53_zone.primary[0].zone_id

  alias {
    evaluate_target_health = true
    name                   = var.grafana_alb_dns_name
    zone_id                = var.grafana_alb_zone_id
  }
}
