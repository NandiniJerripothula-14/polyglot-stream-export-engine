#!/bin/bash

set -e

echo "Creating records table..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Drop existing table if it exists (for idempotency)
    DROP TABLE IF EXISTS records CASCADE;

    CREATE TABLE records (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        name VARCHAR(255) NOT NULL,
        value DECIMAL(18, 4) NOT NULL,
        metadata JSONB NOT NULL
    );

    CREATE INDEX idx_created_at ON records(created_at);
    CREATE INDEX idx_name ON records(name);

    -- Seed with 10 million rows
    -- Using a procedural approach for efficiency
    INSERT INTO records (created_at, name, value, metadata)
    SELECT
        NOW() - (RANDOM() * INTERVAL '365 days'),
        'Record_' || row_number() OVER (ORDER BY (SELECT NULL))::text,
        ROUND((RANDOM() * 10000)::NUMERIC, 4),
        jsonb_build_object(
            'category', CASE (row_number() OVER (ORDER BY (SELECT NULL)) % 5)
                WHEN 0 THEN 'Electronics'
                WHEN 1 THEN 'Furniture'
                WHEN 2 THEN 'Clothing'
                WHEN 3 THEN 'Books'
                ELSE 'Other'
            END,
            'region', CASE (row_number() OVER (ORDER BY (SELECT NULL)) % 4)
                WHEN 0 THEN 'North America'
                WHEN 1 THEN 'Europe'
                WHEN 2 THEN 'Asia'
                ELSE 'South America'
            END,
            'tags', jsonb_build_array('tag_' || (row_number() OVER (ORDER BY (SELECT NULL)) % 100)::text),
            'active', (row_number() OVER (ORDER BY (SELECT NULL)) % 2 = 0),
            'amount', ROUND((RANDOM() * 5000)::NUMERIC, 2)
        )
    FROM generate_series(1, 10000000);

    ANALYZE records;

    SELECT COUNT(*) as total_records FROM records;
EOSQL

echo "Database seeding completed successfully!"
