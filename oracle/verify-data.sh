#!/bin/bash
sudo docker exec ubuntu_evolution-postgres_1 psql -U evolution -d evolution -c "SELECT 'Instance' as tabla, count(*) FROM \"Instance\" UNION ALL SELECT 'Message', count(*) FROM \"Message\" UNION ALL SELECT 'Contact', count(*) FROM \"Contact\" UNION ALL SELECT 'Chat', count(*) FROM \"Chat\" UNION ALL SELECT 'Webhook', count(*) FROM \"Webhook\";"
