#!/bin/bash
echo "=== Neon ==="
sudo docker run --rm postgres:18 psql "postgresql://neondb_owner:npg_Xt4eqmcOpzh0@ep-lingering-bonus-afjvxeqc.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require" -c "SELECT count(*) FROM \"Message\";"
echo "=== Oracle local ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT count(*) FROM \"Message\";"
