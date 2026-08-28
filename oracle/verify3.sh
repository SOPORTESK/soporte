#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename LIMIT 10;"
