-- 迁移：今日排班（岗位字典 + 员工当日排班）
-- 可重复执行：CREATE TABLE IF NOT EXISTS / INSERT IGNORE，不会覆盖既有数据。

CREATE TABLE IF NOT EXISTS shift_stations (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  builtin TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_shift_station_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_shifts (
  id VARCHAR(40) NOT NULL,
  staff_id VARCHAR(40) NOT NULL,
  work_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  station_id VARCHAR(16) NOT NULL,
  station_name VARCHAR(40) NOT NULL DEFAULT '',
  task VARCHAR(200) NOT NULL DEFAULT '',
  created_by VARCHAR(40) NOT NULL DEFAULT '',
  created_by_name VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_daily_shift_staff_day (staff_id, work_date),
  KEY idx_daily_shift_day (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO shift_stations (id, name, sort_order, enabled, builtin, created_at, updated_at) VALUES
('ST01', '前台站', 1, 1, 1, NOW(), NOW()),
('ST02', '饮料站', 2, 1, 1, NOW(), NOW()),
('ST03', '汉堡站', 3, 1, 1, NOW(), NOW()),
('ST04', '裹粉站', 4, 1, 1, NOW(), NOW()),
('ST05', '小食站', 5, 1, 1, NOW(), NOW());
