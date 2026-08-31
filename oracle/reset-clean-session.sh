#!/bin/bash
# reset-clean-session.sh — Reset limpio completo de sesión de Baileys en OCI
echo "=== 1. Deteniendo Evolution API ==="
sudo docker-compose -f ~/evolution/docker-compose.yml stop evolution-api

echo "=== 2. Purgando tablas de sesión en PostgreSQL ==="
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'DELETE FROM "Session"; DELETE FROM "Auth";'

echo "=== 3. Limpiando caché de sesiones en Redis ==="
sudo docker exec ubuntu_evolution-redis_1 redis-cli -p 6379 FLUSHALL

echo "=== 4. Reiniciando Evolution API ==="
sudo docker-compose -f ~/evolution/docker-compose.yml up -d evolution-api

echo "=== 5. Esperando que el servicio inicie... ==="
sleep 8
sudo docker-compose -f ~/evolution/docker-compose.yml ps
echo "Listo. Ahora puede solicitar el nuevo código QR desde el panel de Sekunet."