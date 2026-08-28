#!/bin/bash
# Borrar datos locales que chocaron y reimportar solo Message
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'TRUNCATE TABLE "Message" CASCADE;'

# Extraer solo la tabla Message del dump
sed -n '/COPY public."Message"/,/^\\\.$/p' /tmp/neon-dump.sql > /tmp/message-data.sql

# Restaurar solo Message
sudo docker cp /tmp/message-data.sql ubuntu_evolution-postgres_1:/tmp/message-data.sql
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -f /tmp/message-data.sql

echo "=== Después ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT count(*) FROM "Message";'
