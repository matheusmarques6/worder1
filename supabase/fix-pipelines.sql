-- Fix Pipelines Schema
-- Run this in Supabase SQL Editor

-- Add color column to pipelines table
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#f97316';

-- Add position column to pipelines table (if not exists)
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Update existing pipelines without color
UPDATE pipelines SET color = '#f97316' WHERE color IS NULL;

-- Verify the changes
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'pipelines';
