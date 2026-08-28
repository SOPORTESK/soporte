#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT count(*) FROM "Instance";'
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT count(*) FROM "Message";'
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT id, name, "connectionStatus" FROM "Instance";'
