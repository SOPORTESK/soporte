#!/bin/bash
# Borrar todo y reimportar desde Neon con el ID correcto
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SET session_replication_role = 'replica'; DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO evolution; GRANT ALL ON SCHEMA public TO public;"

# Reimportar
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -f /tmp/neon-dump.sql 2>&1 | tail -5

echo "=== Mensajes ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT count(*) FROM "Message";'
echo "=== Instancias ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT id, name FROM "Instance";'
