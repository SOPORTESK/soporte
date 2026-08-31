#!/bin/bash
# backup-session.sh — Backup diario de la base de datos de Evolution en OCI
BACKUP_DIR="/home/ubuntu/backups"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M)
docker exec ubuntu_evolution-postgres_1 \
  pg_dump -U evolution -d evolution \
  > "$BACKUP_DIR/evolution_$DATE.sql"
find "$BACKUP_DIR" -name "evolution_*.sql" -mtime +7 -delete
echo "$(date -Iseconds) Backup completado: evolution_$DATE.sql" >> /var/log/evolution-health.log