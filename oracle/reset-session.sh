#!/bin/bash
sudo docker-compose -f ~/docker-compose.yml stop evolution-api
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "DELETE FROM \"Session\" WHERE \"sessionId\" = 'f4bf0cd8-8510-4e09-866f-ad09cca52c4a';"
sudo docker-compose -f ~/docker-compose.yml start evolution-api
echo "Hecho"
