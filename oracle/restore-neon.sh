#!/bin/bash
# Restaurar dump en PostgreSQL local de Oracle
sudo docker cp /tmp/neon-dump.sql ubuntu_evolution-postgres_1:/tmp/neon-dump.sql
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -f /tmp/neon-dump.sql 2>&1 | tail -20
echo "---"
echo "Tablas después de restaurar:"
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename;"
