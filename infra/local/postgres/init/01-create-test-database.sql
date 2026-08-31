SELECT 'CREATE DATABASE numerology_test OWNER numerology'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'numerology_test')\gexec
