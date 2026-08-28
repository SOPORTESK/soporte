#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT \"sessionId\" FROM \"Session\" LIMIT 10;"
