#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c 'SELECT column_name, data_type FROM information_schema.columns WHERE table_name='"'"'Instance'"'"' ORDER BY ordinal_position;'
