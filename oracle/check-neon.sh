#!/bin/bash
sudo docker run --rm postgres:15 psql "postgresql://neondb_owner:npg_Xt4eqmcOpzh0@ep-lingering-bonus-afjvxeqc.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require" -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname, tablename;"
