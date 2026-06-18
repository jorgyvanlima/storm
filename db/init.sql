CREATE TABLE IF NOT EXISTS telemetry (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    temperature NUMERIC(4, 1),
    humidity NUMERIC(4, 1),
    precipitation NUMERIC(4, 1),
    pressure NUMERIC(5, 1),
    risk_level VARCHAR(20),
    neighborhoods_status JSONB
);

-- Index for querying recent telemetry quickly
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry (timestamp DESC);
