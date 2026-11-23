-- 迁移：今日排班支持断班（一天两个班段）
-- 目标：
--   1) daily_shifts 增加 segment_no（1、2，默认 1）
--   2) 删除旧的「员工 + 日期」唯一键（若存在）
--   3) 建立新的「员工 + 日期 + 班段」唯一键（若不存在）
-- 可重复执行：每一步都先查 information_schema，再决定是否执行。
-- 旧数据：新增列使用 DEFAULT 1，历史记录自动归入第 1 段，不会丢失。

-- 1) 加列（仅当不存在时）
SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_shifts' AND COLUMN_NAME = 'segment_no'
);
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE daily_shifts ADD COLUMN segment_no TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER work_date',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 兜底：把空值/0 归入第 1 段
UPDATE daily_shifts SET segment_no = 1 WHERE segment_no IS NULL OR segment_no = 0;

-- 2) 删除旧唯一键（仅当存在时）
SET @has_old := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_shifts' AND INDEX_NAME = 'uk_daily_shift_staff_day'
);
SET @ddl := IF(@has_old > 0,
  'ALTER TABLE daily_shifts DROP INDEX uk_daily_shift_staff_day',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) 建立新唯一键（仅当不存在时）
SET @has_new := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'daily_shifts' AND INDEX_NAME = 'uk_daily_shift_staff_day_seg'
);
SET @ddl := IF(@has_new = 0,
  'ALTER TABLE daily_shifts ADD UNIQUE KEY uk_daily_shift_staff_day_seg (staff_id, work_date, segment_no)',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
