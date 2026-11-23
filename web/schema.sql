-- ============================================================
-- 门店人员管理系统 数据库结构（MySQL 5.7+ / 8.0）
-- 字符集 utf8mb4；引擎 InnoDB；含索引与外键
-- 说明：install.php 会按分号拆分执行本文件，并在安装时写入超级管理员密码散列。
-- ============================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS store_settings (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  store_name VARCHAR(80) NOT NULL DEFAULT '塔斯汀 福州市农大金山校区店',
  short_name VARCHAR(80) NOT NULL DEFAULT '塔斯汀 农大金山校区店',
  code VARCHAR(20) NOT NULL DEFAULT 'TA0051',
  settings_json LONGTEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(40) NOT NULL,
  gender VARCHAR(4) NOT NULL DEFAULT '男',
  id_card VARCHAR(18) NULL,
  birth DATE NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(120) NOT NULL DEFAULT '',
  position VARCHAR(20) NOT NULL DEFAULT '店员',
  employment_type VARCHAR(10) NOT NULL DEFAULT '全职',
  hire_date DATE NULL,
  id_card_expiry DATE NULL,
  health_cert_expiry DATE NULL,
  emergency VARCHAR(80) NOT NULL DEFAULT '',
  nickname VARCHAR(20) NOT NULL DEFAULT '',
  feishu_id VARCHAR(64) NOT NULL DEFAULT '',
  feishu_emp_no VARCHAR(64) NOT NULL DEFAULT '',
  avatar VARCHAR(160) NOT NULL DEFAULT '',
  emp_no VARCHAR(24) NULL,
  status ENUM('pending','active','rejected','resigned','disabled') NOT NULL DEFAULT 'pending',
  remark VARCHAR(255) NOT NULL DEFAULT '',
  files_json TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at DATETIME NULL,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  resign_date DATE NULL,
  resign_reason VARCHAR(255) NOT NULL DEFAULT '',
  handover VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uk_staff_id_card (id_card),
  UNIQUE KEY uk_staff_emp_no (emp_no),
  KEY idx_staff_status (status),
  KEY idx_staff_phone (phone),
  KEY idx_staff_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(16) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(40) NOT NULL,
  role ENUM('staff','admin','superadmin') NOT NULL DEFAULT 'staff',
  staff_id VARCHAR(16) NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  password_hash VARCHAR(255) NOT NULL,
  first_login TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_accounts_phone (phone),
  KEY idx_accounts_role (role),
  KEY idx_accounts_staff (staff_id),
  CONSTRAINT fk_accounts_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS salaries (
  id VARCHAR(40) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  month CHAR(7) NOT NULL,
  should_days DECIMAL(5,1) NOT NULL DEFAULT 26.0,
  actual_days DECIMAL(5,1) NULL,
  total_hours DECIMAL(7,2) NOT NULL DEFAULT 0.00,
  base_salary DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  post_allowance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  performance_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  full_attendance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  daily_overtime_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  statutory_holiday_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  meal_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  transport_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  attendance_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  social_subsidy DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  gross_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  inventory_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  late_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  attendance_diff DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  leave_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discipline_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discipline_reason VARCHAR(255) NOT NULL DEFAULT '',
  other_deduction DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  other_reason VARCHAR(255) NOT NULL DEFAULT '',
  insurance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  deduction_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_pay DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  pay_status ENUM('draft','published','paid') NOT NULL DEFAULT 'draft',
  pay_date DATE NULL,
  publish_at DATETIME NULL,
  published_by VARCHAR(40) NOT NULL DEFAULT '',
  hidden TINYINT(1) NOT NULL DEFAULT 0,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  updated_by VARCHAR(40) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_salary_staff_month (staff_id, month),
  KEY idx_salary_month (month),
  KEY idx_salary_status (pay_status),
  CONSTRAINT fk_salary_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scores (
  id VARCHAR(40) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  month CHAR(7) NOT NULL,
  dims_json TEXT NOT NULL,
  adjust_json TEXT NULL,
  total DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  grade VARCHAR(4) NOT NULL DEFAULT 'D',
  status ENUM('draft','published') NOT NULL DEFAULT 'draft',
  publish_at DATETIME NULL,
  published_by VARCHAR(40) NOT NULL DEFAULT '',
  updated_by VARCHAR(40) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_score_staff_month (staff_id, month),
  KEY idx_score_month (month),
  KEY idx_score_status (status),
  CONSTRAINT fk_score_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leaves (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  date DATE NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT '事假',
  reason VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected','withdrawn','cancelled') NOT NULL DEFAULT 'pending',
  manual TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  cancel_requested_at DATETIME NULL,
  force_reason VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_leave_date (date),
  KEY idx_leave_staff_date (staff_id, date),
  KEY idx_leave_status (status),
  CONSTRAINT fk_leave_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedules (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  title VARCHAR(120) NOT NULL,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NULL,
  location VARCHAR(120) NOT NULL DEFAULT '',
  remark VARCHAR(255) NOT NULL DEFAULT '',
  remind_minutes SMALLINT NOT NULL DEFAULT 0 COMMENT '0不提醒；-1到点；5/15/30/60提前提醒',
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_schedule_staff_date (staff_id, schedule_date),
  KEY idx_schedule_date (schedule_date),
  CONSTRAINT fk_schedule_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schedule_participants (
  schedule_id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (schedule_id, staff_id),
  KEY idx_schedule_participant_staff (staff_id),
  CONSTRAINT fk_sp_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sp_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id VARCHAR(24) NOT NULL,
  category VARCHAR(20) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  status ENUM('draft','published','withdrawn','scheduled') NOT NULL DEFAULT 'published',
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  important TINYINT(1) NOT NULL DEFAULT 0,
  publisher VARCHAR(40) NOT NULL DEFAULT '',
  publisher_id VARCHAR(16) NULL,
  publish_at DATETIME NULL COMMENT '定时发布时间；到点后由接口惰性转为 published',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_notice_category (category),
  KEY idx_notice_status (status),
  KEY idx_notice_published (published_at),
  KEY idx_notice_publish_at (publish_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notice_reads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notice_id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  read_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_notice_staff (notice_id, staff_id),
  KEY idx_notice_read_staff (staff_id),
  CONSTRAINT fk_notice_read_notice FOREIGN KEY (notice_id) REFERENCES notices (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notice_read_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 健康证核验记录：每次核验一条，保留历史；cert_key 为核验时的证件快照，
-- 与员工当前健康证文件不一致时视为「未核验」，避免旧结论套用到新证件。
CREATE TABLE IF NOT EXISTS health_cert_verifications (
  id VARCHAR(32) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  cert_key VARCHAR(255) NOT NULL DEFAULT '',
  result ENUM('pass','reject') NOT NULL,
  remark VARCHAR(500) NOT NULL DEFAULT '',
  material_key VARCHAR(255) NOT NULL DEFAULT '',
  material_name VARCHAR(160) NOT NULL DEFAULT '',
  verified_by VARCHAR(16) NOT NULL DEFAULT '',
  verified_name VARCHAR(60) NOT NULL DEFAULT '',
  verified_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hcv_staff (staff_id, verified_at),
  CONSTRAINT fk_hcv_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(32) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  type VARCHAR(24) NOT NULL DEFAULT 'system',
  from_staff_id VARCHAR(16) NOT NULL DEFAULT '' COMMENT '私信发送人；系统消息为空',
  from_name VARCHAR(40) NOT NULL DEFAULT '' COMMENT '发送人姓名快照',
  to_staff_id VARCHAR(16) NOT NULL DEFAULT '' COMMENT '私信接收人；系统消息为空',
  to_name VARCHAR(40) NOT NULL DEFAULT '' COMMENT '接收人姓名快照',
  title VARCHAR(120) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  link VARCHAR(160) NOT NULL DEFAULT '',
  ref_id VARCHAR(40) NOT NULL DEFAULT '',
  thread_id VARCHAR(48) NOT NULL DEFAULT '' COMMENT '私信会话 ID（双方员工 ID 排序拼接）',
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_messages_staff (staff_id, read_at),
  KEY idx_messages_thread (thread_id),
  KEY idx_messages_created (created_at),
  CONSTRAINT fk_messages_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_kinds (
  id VARCHAR(24) NOT NULL,
  name VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  builtin TINYINT(1) NOT NULL DEFAULT 0 COMMENT '内置类型：系统任务，不可删除/停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_kinds_name (name),
  KEY idx_task_kinds_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_kinds (id, name, sort_order, enabled, builtin) VALUES
  ('sys', '系统任务', 1, 1, 1),
  ('reminder', '运营通提醒', 2, 1, 0);

CREATE TABLE IF NOT EXISTS task_templates (
  id VARCHAR(24) NOT NULL,
  title VARCHAR(120) NOT NULL,
  content TEXT NOT NULL,
  parent_id VARCHAR(24) NULL COMMENT '母任务 ID；为空表示顶层任务，仅支持一层分组',
  assignee_id VARCHAR(16) NOT NULL DEFAULT '' COMMENT '个人任务指派的员工 ID；为空表示全店公共任务；子任务存有效指派人',
  assignee_override TINYINT(1) NOT NULL DEFAULT 0 COMMENT '子任务是否单独指定指派人：0=继承母任务或未单独指定，1=单独指定',
  completion_mode ENUM('upload','confirm') NOT NULL DEFAULT 'upload' COMMENT '完成方式：upload 附件上传 / confirm 仅需确认',
  completion_scope ENUM('any','all') NOT NULL DEFAULT 'any' COMMENT '提交方式：any=任意一人提交，all=全员提交',
  publish_time TIME NOT NULL DEFAULT '00:00:00' COMMENT '每期发布时间（配置时区，随 period_date 生效）',
  deadline_time TIME NOT NULL DEFAULT '23:59:59' COMMENT '每期截止时间（必须晚于发布时间，同日）',
  cycle ENUM('once','daily','weekly','monthly') NOT NULL DEFAULT 'once',
  kind_id VARCHAR(24) NOT NULL DEFAULT 'sys' COMMENT '任务类型 ID，关联 task_kinds',
  kind ENUM('task','reminder') NOT NULL DEFAULT 'task' COMMENT '历史列，代码不再读取；迁移后由 kind_id 取代',
  weekdays VARCHAR(20) NOT NULL DEFAULT '',
  month_day TINYINT UNSIGNED NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  store_codes VARCHAR(255) NOT NULL DEFAULT '',
  sample_images_json TEXT NULL COMMENT '拍摄示例图 JSON 数组（最多 3 个 key）',
  status ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
  created_by VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_task_tpl_status (status),
  KEY idx_task_tpl_parent (parent_id),
  KEY idx_task_tpl_assignee (assignee_id),
  KEY idx_task_tpl_kind (kind_id),
  CONSTRAINT fk_task_tpl_parent FOREIGN KEY (parent_id) REFERENCES task_templates (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_task_tpl_kind FOREIGN KEY (kind_id) REFERENCES task_kinds (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_instances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  template_id VARCHAR(24) NOT NULL,
  period_date DATE NOT NULL,
  assignee_id VARCHAR(16) NOT NULL DEFAULT '' COMMENT '生成时的指派对象快照；为空表示全店公共任务',
  completion_mode ENUM('upload','confirm') NOT NULL DEFAULT 'upload',
  completion_scope ENUM('any','all') NOT NULL DEFAULT 'any' COMMENT '生成时的提交方式快照',
  status ENUM('pending','submitted','approved','rejected','overdue') NOT NULL DEFAULT 'pending',
  publish_at DATETIME NULL COMMENT '本期绝对发布时间 = period_date + 模板 publish_time',
  deadline_at DATETIME NULL COMMENT '本期绝对截止时间 = period_date + 模板 deadline_time',
  published_at DATETIME NULL COMMENT '实际发布时刻；NULL 表示尚未发布，员工端不可见',
  submitter_id VARCHAR(16) NULL,
  submitter_name VARCHAR(40) NOT NULL DEFAULT '',
  submitted_at DATETIME NULL,
  images_json TEXT NULL,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewer_id VARCHAR(16) NULL,
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_period (template_id, period_date),
  KEY idx_task_period (period_date, status),
  KEY idx_task_visible (period_date, published_at, status),
  KEY idx_task_assignee (assignee_id, period_date),
  KEY idx_task_submitter (submitter_id),
  CONSTRAINT fk_task_inst_tpl FOREIGN KEY (template_id) REFERENCES task_templates (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_task_inst_staff FOREIGN KEY (submitter_id) REFERENCES staff (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 全员提交：每位执行人的提交记录
CREATE TABLE IF NOT EXISTS task_submissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  instance_id BIGINT UNSIGNED NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  status ENUM('submitted','approved') NOT NULL DEFAULT 'submitted',
  images_json TEXT NULL,
  submitted_at DATETIME NULL,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_submission (instance_id, staff_id),
  KEY idx_task_sub_staff (staff_id),
  CONSTRAINT fk_task_sub_inst FOREIGN KEY (instance_id) REFERENCES task_instances (id) ON DELETE CASCADE,
  CONSTRAINT fk_task_sub_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shift_requests (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  month CHAR(7) NOT NULL,
  slots_json TEXT NOT NULL,
  note VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected','withdrawn','cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  cancel_requested TINYINT(1) NOT NULL DEFAULT 0,
  cancel_requested_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_shift_month (month),
  KEY idx_shift_staff (staff_id),
  KEY idx_shift_status (status),
  CONSTRAINT fk_shift_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  staff_id VARCHAR(16) NOT NULL,
  month CHAR(7) NOT NULL,
  should_rest_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  actual_work_days DECIMAL(4,1) NOT NULL DEFAULT 0.0,
  remark VARCHAR(255) NOT NULL DEFAULT '',
  updated_by VARCHAR(40) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_id, month),
  KEY idx_attendance_month (month),
  CONSTRAINT fk_attendance_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_daily (
  id VARCHAR(64) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  work_date DATE NOT NULL,
  segment_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  emp_no VARCHAR(40) NOT NULL DEFAULT '',
  staff_name VARCHAR(40) NOT NULL DEFAULT '',
  store_code VARCHAR(20) NOT NULL DEFAULT '',
  store_name VARCHAR(80) NOT NULL DEFAULT '',
  position VARCHAR(40) NOT NULL DEFAULT '',
  employment_type VARCHAR(30) NOT NULL DEFAULT '',
  schedule_type VARCHAR(30) NOT NULL DEFAULT '',
  planned_in TIME NULL,
  planned_out TIME NULL,
  planned_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  meal_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  planned_work_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  clock_in TIME NULL,
  clock_out TIME NULL,
  confirm_in TIME NULL,
  confirm_out TIME NULL,
  confirm_meal_hours DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  actual_hours DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  hour_diff DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  manager_confirm VARCHAR(20) NOT NULL DEFAULT '',
  employee_confirm VARCHAR(20) NOT NULL DEFAULT '',
  imported_by VARCHAR(40) NOT NULL DEFAULT '',
  imported_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_attendance_daily (staff_id, work_date, segment_no),
  KEY idx_attendance_daily_date (work_date),
  CONSTRAINT fk_attendance_daily_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS corrections (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  field VARCHAR(32) NOT NULL,
  field_label VARCHAR(40) NOT NULL DEFAULT '',
  old_value VARCHAR(255) NOT NULL DEFAULT '',
  new_value VARCHAR(255) NOT NULL DEFAULT '',
  note VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_correction_staff (staff_id),
  KEY idx_correction_status (status),
  CONSTRAINT fk_correction_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  file_key VARCHAR(120) NOT NULL,
  original_name VARCHAR(160) NOT NULL DEFAULT '',
  mime VARCHAR(80) NOT NULL DEFAULT '',
  size INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by VARCHAR(16) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (file_key),
  KEY idx_files_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  operator VARCHAR(40) NOT NULL DEFAULT '访客',
  role VARCHAR(16) NOT NULL DEFAULT 'guest',
  target VARCHAR(80) NOT NULL DEFAULT '—',
  action VARCHAR(80) NOT NULL DEFAULT '',
  detail VARCHAR(255) NOT NULL DEFAULT '',
  ip VARCHAR(45) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_audit_time (time),
  KEY idx_audit_operator (operator)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_locks (
  phone VARCHAR(20) NOT NULL,
  fails INT UNSIGNED NOT NULL DEFAULT 0,
  lock_until DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报销分类（可在系统设置中新增、改名、排序、启停）
CREATE TABLE IF NOT EXISTS reimburse_categories (
  id VARCHAR(16) NOT NULL,
  name VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_reimburse_cat_name (name),
  KEY idx_reimburse_cat_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 员工收款信息（支付宝 / 银行卡，可保存多条，其中一条默认）
CREATE TABLE IF NOT EXISTS staff_payees (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  type ENUM('alipay','bank') NOT NULL DEFAULT 'alipay',
  account VARCHAR(80) NOT NULL,
  bank_name VARCHAR(80) NOT NULL DEFAULT '',
  holder_name VARCHAR(40) NOT NULL DEFAULT '',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_payee_staff (staff_id, is_default),
  CONSTRAINT fk_payee_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 报销单（分类名与收款信息保存快照，历史单据不受配置变更影响）
CREATE TABLE IF NOT EXISTS reimburse_claims (
  id VARCHAR(32) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  staff_name VARCHAR(40) NOT NULL DEFAULT '',
  category_id VARCHAR(16) NOT NULL,
  category_name VARCHAR(40) NOT NULL DEFAULT '',
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  reason VARCHAR(500) NOT NULL DEFAULT '',
  attachments_json TEXT NULL,
  payee_type VARCHAR(12) NOT NULL DEFAULT '',
  payee_account VARCHAR(80) NOT NULL DEFAULT '',
  payee_bank VARCHAR(80) NOT NULL DEFAULT '',
  payee_holder VARCHAR(40) NOT NULL DEFAULT '',
  status ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  reviewer_id VARCHAR(16) NULL,
  reviewed_by VARCHAR(40) NOT NULL DEFAULT '',
  reviewed_at DATETIME NULL,
  reject_reason VARCHAR(200) NOT NULL DEFAULT '',
  paid_by VARCHAR(40) NOT NULL DEFAULT '',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_claim_staff (staff_id, created_at),
  KEY idx_claim_status (status),
  KEY idx_claim_category (category_id),
  KEY idx_claim_created (created_at),
  CONSTRAINT fk_claim_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 飞书多维表格自动化 webhook 推送记录（同实例同提前档去重；失败重试状态也在此表）
CREATE TABLE IF NOT EXISTS webhook_push_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event VARCHAR(32) NOT NULL DEFAULT 'task.due_soon',
  channel VARCHAR(16) NOT NULL DEFAULT 'public' COMMENT '推送通道：public/personal',
  recipient_id VARCHAR(40) NOT NULL DEFAULT '' COMMENT '个人提醒的接收人员工ID',
  dedupe_key VARCHAR(120) NOT NULL COMMENT '去重键：事件|实例ID|提前分钟数',
  ref_type VARCHAR(24) NOT NULL DEFAULT '',
  ref_id VARCHAR(40) NOT NULL DEFAULT '',
  status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
  http_status SMALLINT NOT NULL DEFAULT 0,
  payload_json TEXT NULL COMMENT '实际推送的 JSON 内容快照',
  response_text VARCHAR(500) NOT NULL DEFAULT '',
  error VARCHAR(255) NOT NULL DEFAULT '',
  next_retry_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_webhook_dedupe (dedupe_key),
  KEY idx_webhook_status (status, next_retry_at),
  KEY idx_webhook_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默认报销分类（与迁移脚本一致，可重复执行）
INSERT IGNORE INTO reimburse_categories (id, name, sort_order, enabled, created_at) VALUES
('RC01', '门店日常外购', 1, 1, NOW()),
('RC02', '市内车费', 2, 1, NOW()),
('RC03', '打印文件', 3, 1, NOW()),
('RC04', '电话费', 4, 1, NOW()),
('RC05', '招聘费用', 5, 1, NOW()),
('RC06', '维修费', 6, 1, NOW()),
('RC07', '员工生日福利', 7, 1, NOW()),
('RC08', '健康证办理', 8, 1, NOW()),
('RC09', '客诉费', 9, 1, NOW()),
('RC10', '漏餐退款', 10, 1, NOW());

-- ------------------------------------------------------------------
-- 初始数据：门店信息与设置
-- ------------------------------------------------------------------
INSERT INTO store_settings (id, store_name, short_name, code, settings_json)
SELECT 1, '塔斯汀 福州市农大金山校区店', '塔斯汀 农大金山校区店', 'TA0051',
'{"dimensions":[{"key":"d1","name":"出品与操作规范","full":25,"desc":"是否按 SOP 操作、出品速度与准确率、原料损耗控制、设备与工位清洁"},{"key":"d2","name":"服务与顾客体验","full":20,"desc":"点单准确、出餐时效、顾客投诉与好评、标准话术执行"},{"key":"d3","name":"卫生与门店标准","full":15,"desc":"个人卫生与工装、岗位区域 5S、闭店清洁、物料效期与存放"},{"key":"d4","name":"出勤与纪律","full":20,"desc":"出勤率、迟到早退、请假规范、工装仪容与手机使用"},{"key":"d5","name":"团队协作与带教","full":10,"desc":"协助他人、带新人、跨岗支援、交接班配合"},{"key":"d6","name":"学习与培训达成","full":10,"desc":"培训考核通过、新品与活动掌握、SOP 复训完成"}],"grades":[{"key":"A","min":90,"coef":1.2,"desc":"优秀"},{"key":"B","min":80,"coef":1.0,"desc":"良好"},{"key":"C","min":70,"coef":0.8,"desc":"合格"},{"key":"D","min":0,"coef":0.5,"desc":"待改进"}],"restRules":{"fullTime":4,"partTime":2,"hourly":0,"maxPerPosition":1,"maxPerDay":3,"maxConsecutive":3,"reviewHours":24},"expiry":{"healthCert":30,"idCard":60},"positions":["店长","店助","值班经理","店员"],"employmentTypes":["全职","兼职","小时工"],"noticeText":"一、处理目的：本页信息仅用于门店人事管理、排班与薪资发放，不用于其他用途，不向第三方提供。\\n二、信息范围：姓名、性别、身份证号、出生日期、手机号、现居住地址、岗位、用工性质、入职日期、紧急联系人、身份证与健康证影像、白底一寸照。\\n三、保存期限：在职期间长期保存，离职后保存 24 个月，到期归档并删除证件影像与住址。\\n四、可见人员：你本人与门店管理组（店长、店助、值班经理）。其他员工无法查看。\\n五、你的权利：可随时查看本人全部信息、申请更正信息，离职后可联系店长申请删除历史档案。","feishuWebhook":{"enabled":false,"url":"","advanceValue":30,"advanceUnit":"minute","maxRetries":3,"events":{"taskDueSoon":true,"noticePublished":true}},"personalWebhook":{"enabled":false,"url":"","maxRetries":3,"events":{"system":true,"task":true,"private":true}},"brandColor":"#C8102E"}'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM store_settings WHERE id = 1);

-- 初始超级管理员（占位散列，必须通过 install.php 设置密码后方可登录）
INSERT INTO staff (id, name, gender, id_card, birth, phone, address, position, employment_type, hire_date, id_card_expiry, health_cert_expiry, emergency, emp_no, status, remark, files_json, created_at, updated_at, submitted_at, reviewed_by, reviewed_at, reject_reason)
SELECT 'S001', '陈晓岚', '女', '35010219880312011X', '1988-03-12', '13800000001', '福州市仓山区金山街道农大路 12 号', '店长', '全职', '2023-03-01', '2033-03-12', DATE_ADD(CURDATE(), INTERVAL 260 DAY), '', 'TA0051-001', 'active', '系统初始超级管理员，请在系统设置中维护', '{}', NOW(), NOW(), NOW(), '系统内置', NOW(), ''
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM staff WHERE id = 'S001');

INSERT INTO accounts (id, phone, name, role, staff_id, status, password_hash, first_login, created_at, last_login_at)
SELECT 'A001', '13800000001', '陈晓岚', 'superadmin', 'S001', 'active', '!install', 1, NOW(), NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE id = 'A001');

-- 匿名反馈：staff_id / author_staff_id 仅数据库留痕，接口不返回
CREATE TABLE IF NOT EXISTS feedbacks (
  id VARCHAR(24) NOT NULL,
  staff_id VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  last_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_staff (staff_id, created_at),
  KEY idx_feedback_last (last_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS feedback_replies (
  id VARCHAR(24) NOT NULL,
  feedback_id VARCHAR(24) NOT NULL,
  author_role ENUM('super','staff') NOT NULL,
  author_staff_id VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_feedback_reply (feedback_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 生日关怀：同人同年只发一次
CREATE TABLE IF NOT EXISTS birthday_greetings (
  staff_id VARCHAR(16) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_id, year),
  CONSTRAINT fk_birthday_staff FOREIGN KEY (staff_id) REFERENCES staff (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 效期检查：分类 / 原物料 / 每日登记与处理
CREATE TABLE IF NOT EXISTS expiry_categories (
  id VARCHAR(32) NOT NULL,
  name VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_expiry_cat_sort (enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expiry_materials (
  id VARCHAR(32) NOT NULL,
  category_id VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  default_mode ENUM('hours','time') NOT NULL DEFAULT 'time',
  default_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  default_time VARCHAR(8) NOT NULL DEFAULT '',
  close_due TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  remark VARCHAR(200) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_expiry_mat (category_id, enabled, sort_order),
  CONSTRAINT fk_expiry_mat_cat FOREIGN KEY (category_id) REFERENCES expiry_categories (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS expiry_records (
  id VARCHAR(32) NOT NULL,
  material_id VARCHAR(32) NOT NULL,
  category_id VARCHAR(32) NOT NULL DEFAULT '',
  material_name VARCHAR(100) NOT NULL DEFAULT '',
  category_name VARCHAR(60) NOT NULL DEFAULT '',
  check_date DATE NOT NULL,
  due_at DATETIME NOT NULL,
  note VARCHAR(200) NOT NULL DEFAULT '',
  status ENUM('normal','processed','scrapped') NOT NULL DEFAULT 'normal',
  processed_by VARCHAR(40) NOT NULL DEFAULT '',
  processed_at DATETIME NULL,
  created_by VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  updated_by VARCHAR(40) NOT NULL DEFAULT '',
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_expiry_material_day (material_id, check_date),
  KEY idx_expiry_due (due_at),
  KEY idx_expiry_day (check_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默认效期分类与原物料（与迁移脚本一致，可重复执行）
INSERT IGNORE INTO expiry_categories (id, name, sort_order, enabled, created_at, updated_at) VALUES
('EC01', '冷藏', 1, 1, NOW(), NOW()),
('EC02', '常温', 2, 1, NOW(), NOW()),
('EC03', '冷冻', 3, 1, NOW(), NOW()),
('EC04', '打烊', 4, 1, NOW(), NOW());

INSERT IGNORE INTO expiry_materials (id, category_id, name, default_mode, default_hours, default_time, close_due, sort_order, enabled, remark, created_at, updated_at) VALUES
('EM01', 'EC01', '生菜', 'time', 0, '23:00', 1, 1, 1, '打烊到期', NOW(), NOW()),
('EM02', 'EC01', '切片番茄', 'hours', 24, '', 0, 2, 1, '', NOW(), NOW()),
('EM03', 'EC02', '面包胚', 'hours', 48, '', 0, 3, 1, '', NOW(), NOW()),
('EM04', 'EC02', '酱料包', 'time', 0, '22:00', 0, 4, 1, '', NOW(), NOW()),
('EM05', 'EC03', '冷冻鸡排', 'time', 0, '22:00', 1, 5, 1, '', NOW(), NOW());

-- 今日排班：岗位字典（工作站）
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

-- 今日排班：员工 + 日期 + 班段 一条记录（同一员工同一天最多两段；重复保存覆盖）
CREATE TABLE IF NOT EXISTS daily_shifts (
  id VARCHAR(40) NOT NULL,
  staff_id VARCHAR(40) NOT NULL,
  work_date DATE NOT NULL,
  segment_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
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
  UNIQUE KEY uk_daily_shift_staff_day_seg (staff_id, work_date, segment_no),
  KEY idx_daily_shift_day (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO shift_stations (id, name, sort_order, enabled, builtin, created_at, updated_at) VALUES
('ST01', '前台站', 1, 1, 1, NOW(), NOW()),
('ST02', '饮料站', 2, 1, 1, NOW(), NOW()),
('ST03', '汉堡站', 3, 1, 1, NOW(), NOW()),
('ST04', '裹粉站', 4, 1, 1, NOW(), NOW()),
('ST05', '小食站', 5, 1, 1, NOW(), NOW());

-- App Token 鉴权（与网页 Session 并存；可重复执行）
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

-- App 通知：设备 Token（FCM/APNs）与推送投递记录（可重复执行）
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
