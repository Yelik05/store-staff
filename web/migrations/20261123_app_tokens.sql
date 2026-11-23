-- 迁移：App Token 鉴权（不改变网页 Session 登录）
-- 可重复执行：CREATE TABLE IF NOT EXISTS，不会覆盖或删除既有数据。

CREATE TABLE IF NOT EXISTS app_tokens (
  id VARCHAR(40) NOT NULL,
  account_id VARCHAR(40) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT '',
  device_name VARCHAR(80) NOT NULL DEFAULT '',
  app_version VARCHAR(20) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_token_hash (token_hash),
  KEY idx_app_token_account (account_id),
  KEY idx_app_token_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
