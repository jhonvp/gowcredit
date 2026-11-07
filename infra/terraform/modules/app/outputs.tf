output "alb_dns_name" { value = aws_lb.api.dns_name }
output "app_security_group_id" { value = aws_security_group.app.id }
output "ecr_repository_url" { value = aws_ecr_repository.api.repository_url }
output "cluster_name" { value = aws_ecs_cluster.this.name }
output "api_service_name" { value = aws_ecs_service.api.name }
output "worker_service_name" { value = aws_ecs_service.worker.name }
output "migrate_task_definition" { value = aws_ecs_task_definition.migrate.family }
