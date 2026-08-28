#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT table_name FROM information_schema.tables WHERE table_schema='evolution_api' ORDER BY table_name;"
