-- Create whatsapp_groups table for scraped groups
CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  whatsapp_session_id BIGINT UNSIGNED NOT NULL,
  group_jid VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  owner_jid VARCHAR(255) NULL,
  subject_time TIMESTAMP NULL,
  subject_owner_jid VARCHAR(255) NULL,
  participants_count INT UNSIGNED NOT NULL DEFAULT 0,
  admins_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_announce BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_session_id (whatsapp_session_id),
  INDEX idx_group_jid (group_jid),
  INDEX idx_created_at (created_at),
  UNIQUE KEY unique_user_session_group (user_id, whatsapp_session_id, group_jid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
