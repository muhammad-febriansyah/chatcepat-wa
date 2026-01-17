-- Create scraping_logs table to track scraping activity and prevent abuse
CREATE TABLE IF NOT EXISTS scraping_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  whatsapp_session_id BIGINT UNSIGNED NOT NULL,
  total_scraped INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('in_progress', 'completed', 'failed') NOT NULL DEFAULT 'in_progress',
  error_message TEXT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_session_id (whatsapp_session_id),
  INDEX idx_started_at (started_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
