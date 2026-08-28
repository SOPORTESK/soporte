#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT "clientName" FROM "Instance";'
