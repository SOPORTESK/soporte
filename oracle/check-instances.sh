#!/bin/bash
echo "=== Instancias en Neon ==="
sudo docker run --rm postgres:18 psql "postgresql://neondb_owner:npg_Xt4eqmcOpzh0@ep-lingering-bonus-afjvxeqc.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require" -c 'SELECT id, name, "connectionStatus" FROM "Instance";'
echo "=== Instancias en Oracle ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT id, name, "connectionStatus" FROM "Instance";'
