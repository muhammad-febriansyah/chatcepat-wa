-- Create whatsapp_contacts table for scraped contacts
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  whatsapp_session_id BIGINT UNSIGNED NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  display_name VARCHAR(255) NULL,
  push_name VARCHAR(255) NULL,
  is_business BOOLEAN NOT NULL DEFAULT FALSE,
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSON NULL,
  last_message_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_session_id (whatsapp_session_id),
  INDEX idx_phone_number (phone_number),
  INDEX idx_created_at (created_at),
  UNIQUE KEY unique_user_session_phone (user_id, whatsapp_session_id, phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
