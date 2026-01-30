-- Fix created_at and updated_at timestamps for existing records
-- This fixes records that have Unix epoch date (1970-01-01) or NULL values

-- Fix whatsapp_sessions table
UPDATE whatsapp_sessions
SET created_at = COALESCE(updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Fix whatsapp_messages table
UPDATE whatsapp_messages
SET created_at = COALESCE(sent_at, updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Fix whatsapp_contacts table
UPDATE whatsapp_contacts
SET created_at = COALESCE(last_message_at, updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Fix whatsapp_groups table
UPDATE whatsapp_groups
SET created_at = COALESCE(updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Fix broadcast_campaigns table
UPDATE broadcast_campaigns
SET created_at = COALESCE(scheduled_at, updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Fix whatsapp_rate_limits table
UPDATE whatsapp_rate_limits
SET created_at = COALESCE(last_message_sent_at, updated_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL
   OR created_at < '2020-01-01 00:00:00'
   OR YEAR(created_at) = 1970;

-- Display summary of fixed records
SELECT 'Fixed records summary:' as message;
SELECT 'whatsapp_sessions' as table_name, COUNT(*) as fixed_count
FROM whatsapp_sessions
WHERE created_at >= '2020-01-01 00:00:00';
