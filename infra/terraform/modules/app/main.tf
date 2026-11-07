# One image, two ECS Fargate services (ADR 0006): the API behind an ALB and the SQS worker.
# Each task runs the Datadog agent as a sidecar for APM (ADR 0009); logs go to CloudWatch.

data "aws_region" "current" {}

resource "aws_ecr_repository" "api" {
  name                 = "${var.name}-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  tags = var.tags
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  tags = var.tags
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.name}"
  retention_in_days = 30
  tags              = var.tags
}

# ---- IAM ----
data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = concat(values(var.secret_arns), [var.db_secret_arn])
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secrets.json
}

# Least privilege for the application itself: its bucket, its queue, sending email.
data "aws_iam_policy_document" "task" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${var.bucket_arn}/*"]
  }
  statement {
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueUrl", "sqs:GetQueueAttributes"]
    resources = [var.queue_arn]
  }
  statement {
    actions   = ["ses:SendRawEmail", "ses:SendEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy" "task" {
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

# ---- Networking ----
resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = var.vpc_id
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_security_group" "app" {
  name   = "${var.name}-app"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = var.tags
}

resource "aws_lb" "api" {
  name               = "${var.name}-api"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  tags               = var.tags
}

resource "aws_lb_target_group" "api" {
  name        = "${var.name}-api"
  port        = 3000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = var.vpc_id
  health_check {
    path    = "/health"
    matcher = "200"
  }
  tags = var.tags
}

# CloudFront terminates TLS for viewers; ALB ↔ CloudFront TLS (ACM cert) is a documented follow-up.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.api.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ---- Task definitions ----
locals {
  image = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  env = [
    { name = "NODE_ENV", value = "production" },
    { name = "LOG_LEVEL", value = "info" },
    { name = "DB_HOST", value = var.db_host },
    { name = "DB_NAME", value = "gowcredit" },
    { name = "S3_BUCKET", value = var.bucket_name },
    { name = "SQS_QUEUE_NAME", value = var.queue_name },
    { name = "LLM_MODE", value = var.llm_mode },
    { name = "SMTP_URL", value = var.smtp_url },
    { name = "MAIL_FROM", value = var.mail_from },
    { name = "WEB_BASE_URL", value = var.web_base_url },
    { name = "DD_ENV", value = var.environment },
    { name = "DD_SERVICE", value = "gowcredit" },
    { name = "DD_TRACE_ENABLED", value = "true" },
    { name = "DD_AGENT_HOST", value = "localhost" },
  ]
  secrets = [
    { name = "DB_USER", valueFrom = "${var.db_secret_arn}:username::" },
    { name = "DB_PASSWORD", valueFrom = "${var.db_secret_arn}:password::" },
    { name = "JWT_SECRET", valueFrom = var.secret_arns["jwt-secret"] },
    { name = "ANTHROPIC_API_KEY", valueFrom = var.secret_arns["anthropic-api-key"] },
  ]
  log = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.app.name
      awslogs-region        = data.aws_region.current.region
      awslogs-stream-prefix = "app"
    }
  }
  datadog = {
    name      = "datadog-agent"
    image     = "public.ecr.aws/datadog/agent:7"
    essential = false
    environment = [
      { name = "ECS_FARGATE", value = "true" },
      { name = "DD_APM_ENABLED", value = "true" },
      { name = "DD_SITE", value = var.datadog_site },
    ]
    secrets          = [{ name = "DD_API_KEY", valueFrom = var.secret_arns["datadog-api-key"] }]
    logConfiguration = local.log
  }
  containers = {
    api    = { command = ["node", "dist/main.js"], port = true }
    worker = { command = ["node", "dist/worker.js"], port = false }
  }
}

resource "aws_ecs_task_definition" "this" {
  for_each                 = local.containers
  family                   = "${var.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.key == "worker" ? 1024 : 512
  memory                   = each.key == "worker" ? 2048 : 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([
    {
      name             = each.key
      image            = local.image
      essential        = true
      command          = each.value.command
      environment      = local.env
      secrets          = local.secrets
      logConfiguration = local.log
      portMappings     = each.value.port ? [{ containerPort = 3000, protocol = "tcp" }] : []
    },
    local.datadog,
  ])
  tags = var.tags
}

# One-off migration task (the deploy workflow runs it before rolling the services).
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${var.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "migrate"
    image            = local.image
    essential        = true
    command          = ["node", "dist/migrate.js"]
    environment      = local.env
    secrets          = local.secrets
    logConfiguration = local.log
  }])
  tags = var.tags
}

resource "aws_ecs_service" "api" {
  name            = "${var.name}-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this["api"].arn
  desired_count   = var.api_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  tags = var.tags
}

resource "aws_ecs_service" "worker" {
  name            = "${var.name}-worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.this["worker"].arn
  desired_count   = 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.app.id]
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle {
    ignore_changes = [desired_count] # owned by autoscaling
  }
  tags = var.tags
}

# Worker autoscaling on queue depth: ~5 visible messages per task, 1..max tasks.
resource "aws_appautoscaling_target" "worker" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = 1
  max_capacity       = var.worker_max
}

resource "aws_appautoscaling_policy" "worker_queue_depth" {
  name               = "${var.name}-worker-queue-depth"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  target_tracking_scaling_policy_configuration {
    target_value = 5
    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"
      dimensions {
        name  = "QueueName"
        value = var.queue_name
      }
    }
  }
}
