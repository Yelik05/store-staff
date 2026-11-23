-- 迁移：App 通知设备 Token 与推送投递记录（可重复执行）
-- 用于 FCM / APNs 接入；未配置推送凭据时，App 自动降级为本地通知轮询。

CREATE TABLE IF NOT EXISTS app_device_tokens (
  id VARCHAR(40) NOT NULL,
  account_id VARCHAR(40) NOT NULL,
  staff_id VARCHAR(16) NOT NULL DEFAULT '',
  platform VARCHAR(16) NOT NULL DEFAULT '',
  token VARCHAR(200) NOT NULL,
  device_name VARCHAR(80) NOT NULL DEFAULT '',
  app_version VARCHAR(20) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_device_platform_token (platform, token(180)),
  KEY idx_device_account (account_id),
  KEY idx_device_staff (staff_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_push_deliveries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(80) NOT NULL,
  device_id VARCHAR(40) NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT '',
  detail VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_push_event_device (event_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
