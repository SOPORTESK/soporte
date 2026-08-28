#!/bin/bash
# Dump de Neon con pg_dump v18
sudo docker run --rm postgres:18 pg_dump "postgresql://neondb_owner:npg_Xt4eqmcOpzh0@ep-lingering-bonus-afjvxeqc.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require" > /tmp/neon-dump.sql
echo "Dump size:"
ls -lh /tmp/neon-dump.sql
