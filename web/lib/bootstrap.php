<?php
/* bootstrap.php — 配置、PDO、会话、通用工具与数据映射 */

if (!defined('APP_ROOT')) define('APP_ROOT', dirname(__DIR__));

class ApiException extends Exception
{
    public $apiCode;
    public $httpStatus;
    public $extra;

    public function __construct($message, $apiCode = null, $httpStatus = 400, $extra = array())
    {
        parent::__construct($message);
        $this->apiCode = $apiCode;
        $this->httpStatus = $httpStatus;
        $this->extra = is_array($extra) ? $extra : array();
    }
}

function app_config()
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $file = APP_ROOT . '/config.php';
    if (!is_file($file)) {
        throw new ApiException('系统尚未安装，请先访问 install.php 完成安装向导', 'INSTALL_REQUIRED', 503);
    }
    $loaded = require $file;
    if (!is_array($loaded) || empty($loaded['db'])) {
        throw new ApiException('config.php 配置格式不正确，请重新运行 install.php', 'BAD_CONFIG', 503);
    }
    $cfg = $loaded;
    $tz = isset($cfg['app']['timezone']) ? $cfg['app']['timezone'] : 'Asia/Shanghai';
    date_default_timezone_set($tz);
    return $cfg;
}

function db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $cfg = app_config();
    $c = $cfg['db'];
    $dsn = 'mysql:host=' . $c['host'] . ';port=' . $c['port'] . ';dbname=' . $c['name'] . ';charset=utf8mb4';
    try {
        $pdo = new PDO($dsn, $c['user'], $c['pass'], array(
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ));
        $pdo->exec('SET NAMES utf8mb4');
    } catch (PDOException $e) {
        error_log('DB connect failed: ' . $e->getMessage());
        throw new ApiException('数据库连接失败，请检查 config.php 中的数据库信息', 'DB_ERROR', 500);
    }
    return $pdo;
}

function app_session_start()
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $cfg = app_config();
    $name = isset($cfg['app']['session_name']) ? $cfg['app']['session_name'] : 'TSSTAFFSID';
    session_name($name);
    $secure = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off');
    session_set_cookie_params(array(
        'lifetime' => 0,
        'path' => '/',
        'domain' => '',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax'
    ));
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.gc_maxlifetime', '604800');
    @session_start();
    if (!empty($_SESSION['remember'])) {
        @setcookie(session_name(), session_id(), array(
            'expires' => time() + 7 * 86400,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ));
    }
}

function json_out($payload, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function read_input()
{
    $ct = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    if (stripos($ct, 'application/json') !== false) {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (is_array($data)) return $data;
        return array();
    }
    return $_POST;
}

function now_dt()
{
    return date('Y-m-d H:i:s');
}

function today_d()
{
    return date('Y-m-d');
}

function iso($v)
{
    if ($v === null) return '';
    $v = (string)$v;
    if ($v === '' || substr($v, 0, 10) === '0000-00-00') return '';
    return str_replace(' ', 'T', $v);
}

function str_limit($v, $max)
{
    $v = (string)$v;
    if (function_exists('mb_substr')) return mb_substr($v, 0, $max, 'UTF-8');
    return substr($v, 0, $max);
}

function in_str($arr, $key, $max = 255, $default = '')
{
    if (!isset($arr[$key]) || is_array($arr[$key])) return $default;
    return str_limit(trim((string)$arr[$key]), $max);
}

function in_num($arr, $key, $default = 0)
{
    if (!isset($arr[$key]) || $arr[$key] === '') return $default;
    return is_numeric($arr[$key]) ? (float)$arr[$key] : $default;
}

function in_int($arr, $key, $default = 0)
{
    return (int)round(in_num($arr, $key, $default));
}

function in_bool($arr, $key)
{
    if (!isset($arr[$key])) return false;
    $v = $arr[$key];
    return $v === true || $v === 1 || $v === '1' || $v === 'true' || $v === 'on';
}

function json_field($raw, $default = array())
{
    if (!$raw) return $default;
    $v = json_decode($raw, true);
    return is_array($v) ? $v : $default;
}

/* ---------------- 会话与权限 ---------------- */

function session_destroy_now()
{
    $_SESSION = array();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        @setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    @session_destroy();
}

function account_by_id($id)
{
    $st = db()->prepare('SELECT * FROM accounts WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

function current_account()
{
    if (isset($_SESSION['account_id']) && $_SESSION['account_id']) {
        $acc = account_by_id($_SESSION['account_id']);
        if (!$acc || $acc['status'] === 'disabled') {
            session_destroy_now();
            return null;
        }
        return $acc;
    }
    /* 无 Session 时回落到 App Token；不带 X-App-Token 的网页请求保持原行为 */
    return app_token_current_account();
}

function require_login()
{
    $acc = current_account();
    if ($acc) return $acc;
    app_session_start();
    $acc = current_account();
    if (!$acc) throw new ApiException('登录状态已失效，请重新登录', 'UNAUTHORIZED', 401);
    return $acc;
}

function require_admin()
{
    $acc = require_login();
    if ($acc['role'] !== 'admin' && $acc['role'] !== 'superadmin') {
        throw new ApiException('无权限执行该操作', 'FORBIDDEN', 403);
    }
    return $acc;
}

function require_super()
{
    $acc = require_login();
    if ($acc['role'] !== 'superadmin') {
        throw new ApiException('该操作仅店长（超级管理员）可执行', 'FORBIDDEN_SUPER', 403);
    }
    return $acc;
}

function audit_log($action, $target = '—', $detail = '')
{
    $acc = null;
    try { $acc = current_account(); } catch (Exception $e) { $acc = null; }
    $operator = $acc ? $acc['name'] : '访客';
    $role = $acc ? $acc['role'] : 'guest';
    try {
        $st = db()->prepare('INSERT INTO audit_logs (time, operator, role, target, action, detail, ip) VALUES (?,?,?,?,?,?,?)');
        $st->execute(array(now_dt(), $operator, $role, str_limit($target, 80), str_limit($action, 80), str_limit($detail, 255), isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''));
    } catch (Exception $e) {
        error_log('audit_log failed: ' . $e->getMessage());
    }
}

/* ---------------- 通用数据 ---------------- */

function default_settings()
{
    return array(
        'dimensions' => array(
            array('key' => 'd1', 'name' => '出品与操作规范', 'full' => 25, 'desc' => '是否按 SOP 操作、出品速度与准确率、原料损耗控制、设备与工位清洁'),
            array('key' => 'd2', 'name' => '服务与顾客体验', 'full' => 20, 'desc' => '点单准确、出餐时效、顾客投诉与好评、标准话术执行'),
            array('key' => 'd3', 'name' => '卫生与门店标准', 'full' => 15, 'desc' => '个人卫生与工装、岗位区域 5S、闭店清洁、物料效期与存放'),
            array('key' => 'd4', 'name' => '出勤与纪律', 'full' => 20, 'desc' => '出勤率、迟到早退、请假规范、工装仪容与手机使用'),
            array('key' => 'd5', 'name' => '团队协作与带教', 'full' => 10, 'desc' => '协助他人、带新人、跨岗支援、交接班配合'),
            array('key' => 'd6', 'name' => '学习与培训达成', 'full' => 10, 'desc' => '培训考核通过、新品与活动掌握、SOP 复训完成')
        ),
        'grades' => array(
            array('key' => 'A', 'min' => 90, 'coef' => 1.2, 'desc' => '优秀'),
            array('key' => 'B', 'min' => 80, 'coef' => 1.0, 'desc' => '良好'),
            array('key' => 'C', 'min' => 70, 'coef' => 0.8, 'desc' => '合格'),
            array('key' => 'D', 'min' => 0, 'coef' => 0.5, 'desc' => '待改进')
        ),
        'restRules' => array('fullTime' => 4, 'partTime' => 2, 'hourly' => 0, 'maxPerPosition' => 1, 'maxPerDay' => 3, 'maxConsecutive' => 3, 'reviewHours' => 24),
        'expiry' => array('healthCert' => 30, 'idCard' => 60),
        /* 门店默认打烊时间：标记「默认打烊到期」的原物料统一取该时刻 */
        'expiryCloseTime' => '23:00',
        'positions' => positions_list(),
        'employmentTypes' => array('全职', '兼职', '小时工'),
        'healthDisclosure' => array('enabled' => false, 'fullName' => false),
        'feishuWebhook' => array(
            'enabled' => false,
            'url' => '',
            'advanceValue' => 30,
            'advanceUnit' => 'minute',
            'maxRetries' => 3,
            'events' => array('taskDueSoon' => true, 'noticePublished' => true)
        ),
        'personalWebhook' => array(
            'enabled' => false,
            'url' => '',
            'maxRetries' => 3,
            'events' => array('system' => true, 'task' => true, 'private' => true, 'birthday' => true, 'shift' => true)
        ),
        'birthdayCare' => array('enabled' => true, 'template' => ''),
        'shiftReminder' => '',
        'siteTitle' => '塔斯汀门店人员管理系统',
        'noticeText' => "一、处理目的：本页信息仅用于门店人事管理、排班与薪资发放，不用于其他用途，不向第三方提供。\n二、信息范围：姓名、性别、身份证号、出生日期、手机号、现居住地址、岗位、用工性质、入职日期、紧急联系人、身份证与健康证影像、白底一寸照。\n三、保存期限：在职期间长期保存，离职后保存 24 个月，到期归档并删除证件影像与住址。\n四、可见人员：你本人与门店管理组（店长、店助、值班经理）。其他员工无法查看。\n五、你的权利：可随时查看本人全部信息、申请更正信息，离职后可联系店长申请删除历史档案。",
        'brandColor' => '#C8102E'
    );
}

function app_public_url($path)
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string)$_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : 'localhost';
    $dir = isset($_SERVER['SCRIPT_NAME']) ? rtrim(str_replace('\\', '/', dirname((string)$_SERVER['SCRIPT_NAME'])), '/') : '';
    return ($https ? 'https' : 'http') . '://' . $host . $dir . '/' . ltrim((string)$path, '/');
}

function settings_data()
{
    $st = db()->query('SELECT * FROM store_settings WHERE id = 1');
    $row = $st->fetch();
    $base = default_settings();
    if (!$row) return $base;
    $saved = json_field($row['settings_json'], array());
    return array_merge($base, $saved);
}

function default_site_title()
{
    return '塔斯汀门店人员管理系统';
}

/* 站点标题：未配置或为空时回退默认值 */
function site_title($settings = null)
{
    if ($settings === null) $settings = settings_data();
    $title = isset($settings['siteTitle']) ? trim((string)$settings['siteTitle']) : '';
    return $title !== '' ? $title : default_site_title();
}

function store_info()
{
    $st = db()->query('SELECT store_name, short_name, code FROM store_settings WHERE id = 1');
    $row = $st->fetch();
    if (!$row) {
        return array('name' => '塔斯汀 福州市农大金山校区店', 'shortName' => '塔斯汀 农大金山校区店', 'code' => 'TA0051');
    }
    return array('name' => $row['store_name'], 'shortName' => $row['short_name'], 'code' => $row['code']);
}

function save_settings_data($settings)
{
    $json = json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $st = db()->prepare('UPDATE store_settings SET settings_json = ?, updated_at = ? WHERE id = 1');
    $st->execute(array($json, now_dt()));
}

function staff_by_id($id)
{
    $st = db()->prepare('SELECT * FROM staff WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

function staff_files($row)
{
    $f = json_field($row['files_json'], array());
    $out = array();
    foreach (array('idFront', 'idBack', 'photo', 'healthCert') as $k) {
        $out[$k] = isset($f[$k]) ? (string)$f[$k] : '';
    }
    return $out;
}

/**
 * 当前岗位选项（与前端 assets/js/validate.js 的 V.POSITIONS 保持一致）
 */
function positions_list()
{
    return array('店长', '店助', '值班经理', '店员');
}

/**
 * 把历史岗位值映射到当前选项，避免旧值（副店长、店长助理、值班主管等）出现在页面或导出中。
 */
function normalize_position($p)
{
    $map = array(
        '店长' => '店长',
        '副店长' => '店助',
        '店长助理' => '店助',
        '店助' => '店助',
        '值班主管' => '值班经理',
        '值班经理' => '值班经理',
        '店员' => '店员',
        '前厅服务' => '店员',
        '前厅收银' => '店员',
        '后厨制作' => '店员',
        '兼职' => '店员',
        '其他' => '店员'
    );
    $p = trim((string)$p);
    if ($p === '') return '店员';
    return isset($map[$p]) ? $map[$p] : '店员';
}

/**
 * 姓名展示口径：设置昵称时统一显示「昵称（名字）」。
 */
function display_name($name, $nickname)
{
    $name = (string)$name;
    $nickname = trim((string)$nickname);
    return $nickname !== '' ? $nickname . '（' . $name . '）' : $name;
}

/**
 * 站内消息（个人任务分配、排休审批结果等）。
 * 旧库未执行迁移时静默降级，不阻塞主流程。
 */
function next_message_id()
{
    return 'M' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 6);
}

function push_message($staffId, $type, $title, $body = '', $link = '', $refId = '', $dedupeKey = '')
{
    $staffId = (string)$staffId;
    if ($staffId === '') return;
    try {
        $id = next_message_id();
        $st = db()->prepare('INSERT INTO messages (id, staff_id, type, title, body, link, ref_id, created_at) VALUES (?,?,?,?,?,?,?,?)');
        $st->execute(array($id, $staffId, $type, $title, $body, $link, $refId, now_dt()));
        /* 个人提醒通道：只针对该员工，失败静默 */
        if (function_exists('personal_webhook_push')) {
            personal_webhook_push($staffId, $type, $title, $body, $link, $id, '', array('refId' => $refId, 'dedupeKey' => $dedupeKey));
        }
    } catch (Exception $e) {
        /* 忽略：消息表缺失或写入失败不应影响审批/任务主流程 */
    }
}

function staff_out($r)
{
    if (!$r) return null;
    return array(
        'id' => $r['id'],
        'name' => $r['name'],
        'nickname' => isset($r['nickname']) ? $r['nickname'] : '',
        'feishuId' => isset($r['feishu_id']) ? $r['feishu_id'] : '',
        'feishuEmpNo' => isset($r['feishu_emp_no']) ? $r['feishu_emp_no'] : '',
        'avatar' => isset($r['avatar']) ? $r['avatar'] : '',
        'displayName' => display_name($r['name'], isset($r['nickname']) ? $r['nickname'] : ''),
        'gender' => $r['gender'],
        'idCard' => $r['id_card'] ? $r['id_card'] : '',
        'birth' => $r['birth'] ? $r['birth'] : '',
        'phone' => $r['phone'],
        'address' => $r['address'],
        'position' => normalize_position($r['position']),
        'employmentType' => $r['employment_type'],
        'hireDate' => $r['hire_date'] ? $r['hire_date'] : '',
        'idCardExpiry' => $r['id_card_expiry'] ? $r['id_card_expiry'] : '',
        'healthCertExpiry' => $r['health_cert_expiry'] ? $r['health_cert_expiry'] : '',
        'emergency' => $r['emergency'],
        'empNo' => $r['emp_no'] ? $r['emp_no'] : '',
        'status' => $r['status'],
        'remark' => $r['remark'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at']),
        'submittedAt' => iso($r['submitted_at']),
        'reviewedBy' => $r['reviewed_by'],
        'reviewedAt' => iso($r['reviewed_at']),
        'rejectReason' => $r['reject_reason'],
        'resignDate' => $r['resign_date'] ? $r['resign_date'] : '',
        'resignReason' => $r['resign_reason'],
        'handover' => $r['handover'],
        'files' => staff_files($r)
    );
}

function account_out($r)
{
    return array(
        'id' => $r['id'],
        'phone' => $r['phone'],
        'name' => $r['name'],
        'role' => $r['role'],
        'staffId' => $r['staff_id'],
        'status' => $r['status'],
        'firstLogin' => (bool)$r['first_login'],
        'createdAt' => iso($r['created_at']),
        'lastLoginAt' => iso($r['last_login_at'])
    );
}

function active_staff_rows()
{
    return db()->query("SELECT * FROM staff WHERE status = 'active'")->fetchAll();
}

function next_staff_id()
{
    $rows = db()->query('SELECT id FROM staff')->fetchAll(PDO::FETCH_COLUMN);
    $max = 0;
    foreach ($rows as $id) {
        if (preg_match('/^S(\d+)$/', $id, $m)) $max = max($max, (int)$m[1]);
    }
    return 'S' . str_pad((string)($max + 1), 3, '0', STR_PAD_LEFT);
}

function next_account_id($staffId)
{
    $base = 'A' . substr($staffId, 1);
    if (!account_by_id($base)) return $base;
    return 'A' . substr((string)microtime(true), -8) . mt_rand(10, 99);
}

function next_emp_no()
{
    $info = store_info();
    $rows = db()->query('SELECT emp_no FROM staff WHERE emp_no IS NOT NULL')->fetchAll(PDO::FETCH_COLUMN);
    $max = 0;
    foreach ($rows as $no) {
        if (preg_match('/(\d+)\s*$/', $no, $m)) $max = max($max, (int)$m[1]);
    }
    return $info['code'] . '-' . str_pad((string)max($max + 1, 1), 3, '0', STR_PAD_LEFT);
}

function next_leave_id($month)
{
    $prefix = 'LH-' . str_replace('-', '', $month) . '-';
    $st = db()->prepare('SELECT id FROM leaves WHERE id LIKE ?');
    $st->execute(array($prefix . '%'));
    $rows = $st->fetchAll(PDO::FETCH_COLUMN);
    $max = 0;
    foreach ($rows as $id) {
        $n = (int)substr($id, strlen($prefix));
        if ($n > $max) $max = $n;
    }
    return $prefix . str_pad((string)($max + 1), 2, '0', STR_PAD_LEFT);
}

function next_notice_id()
{
    $prefix = 'NT-' . date('Ymd') . '-';
    $st = db()->prepare('SELECT id FROM notices WHERE id LIKE ?');
    $st->execute(array($prefix . '%'));
    $max = 0;
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $n = (int)substr($id, strlen($prefix));
        if ($n > $max) $max = $n;
    }
    return $prefix . str_pad((string)($max + 1), 2, '0', STR_PAD_LEFT);
}

function next_task_template_id()
{
    $rows = db()->query('SELECT id FROM task_templates')->fetchAll(PDO::FETCH_COLUMN);
    $max = 0;
    foreach ($rows as $id) {
        if (preg_match('/^TT-(\d+)$/', $id, $m)) $max = max($max, (int)$m[1]);
    }
    return 'TT-' . str_pad((string)($max + 1), 3, '0', STR_PAD_LEFT);
}

function next_shift_id($month)
{
    $prefix = 'SF-' . str_replace('-', '', $month) . '-';
    $st = db()->prepare('SELECT id FROM shift_requests WHERE id LIKE ?');
    $st->execute(array($prefix . '%'));
    $max = 0;
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
        $n = (int)substr($id, strlen($prefix));
        if ($n > $max) $max = $n;
    }
    return $prefix . str_pad((string)($max + 1), 2, '0', STR_PAD_LEFT);
}

function next_correction_id()
{
    $rows = db()->query('SELECT id FROM corrections')->fetchAll(PDO::FETCH_COLUMN);
    $max = 0;
    foreach ($rows as $id) {
        if (preg_match('/^CR-(\d+)$/', $id, $m)) $max = max($max, (int)$m[1]);
    }
    return 'CR-' . str_pad((string)($max + 1), 3, '0', STR_PAD_LEFT);
}

/* ---------------- 业务辅助 ---------------- */

function month_of($date)
{
    return substr((string)$date, 0, 7);
}

function diff_days($date, $base)
{
    $a = strtotime($date . ' 00:00:00');
    $b = strtotime($base . ' 00:00:00');
    if ($a === false || $b === false) return 0;
    return (int)round(($a - $b) / 86400);
}

function default_rest_days($staff)
{
    $r = settings_data();
    $rules = isset($r['restRules']) ? $r['restRules'] : array();
    if ($staff['employment_type'] === '全职') return isset($rules['fullTime']) ? (float)$rules['fullTime'] : 4;
    if ($staff['employment_type'] === '兼职') return isset($rules['partTime']) ? (float)$rules['partTime'] : 2;
    return isset($rules['hourly']) ? (float)$rules['hourly'] : 0;
}

function attendance_row($staffId, $month)
{
    $st = db()->prepare('SELECT * FROM attendance WHERE staff_id = ? AND month = ?');
    $st->execute(array($staffId, $month));
    $row = $st->fetch();
    return $row ? $row : null;
}

function ensure_attendance($staffId, $month, $by = '系统')
{
    $row = attendance_row($staffId, $month);
    if ($row) return $row;
    $staff = staff_by_id($staffId);
    $should = $staff ? default_rest_days($staff) : 0;
    $st = db()->prepare('INSERT INTO attendance (staff_id, month, should_rest_days, actual_work_days, remark, updated_by, updated_at) VALUES (?,?,?,0,\'\',?,?)');
    $st->execute(array($staffId, $month, $should, str_limit($by, 40), now_dt()));
    return attendance_row($staffId, $month);
}

function leave_out($r)
{
    return array(
        'id' => $r['id'],
        'staffId' => $r['staff_id'],
        'date' => $r['date'],
        'type' => $r['type'],
        'reason' => $r['reason'],
        'status' => $r['status'],
        'manual' => (bool)$r['manual'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at']),
        'reviewedBy' => $r['reviewed_by'],
        'reviewedAt' => iso($r['reviewed_at']),
        'rejectReason' => $r['reject_reason'],
        'cancelRequested' => (bool)$r['cancel_requested'],
        'cancelRequestedAt' => iso($r['cancel_requested_at']),
        'forceReason' => $r['force_reason']
    );
}

function leave_stats($staffId, $month)
{
    $st = db()->prepare("SELECT * FROM leaves WHERE staff_id = ? AND DATE_FORMAT(date, '%Y-%m') = ? ORDER BY date DESC");
    $st->execute(array($staffId, $month));
    $rows = $st->fetchAll();
    $used = 0;
    $pending = 0;
    $byType = array('月休' => 0, '调休' => 0, '事假' => 0, '病假' => 0);
    foreach ($rows as $r) {
        $t = isset($byType[$r['type']]) ? $r['type'] : '月休';
        if ($r['status'] === 'approved') {
            $byType[$t]++;
            /* 月休额度按全部已通过类型统计：事假、病假同样占用月休额度 */
            $used++;
        }
        if ($r['status'] === 'pending') $pending++;
    }
    $att = attendance_row($staffId, $month);
    if (!$att) {
        $staff = staff_by_id($staffId);
        $quota = $staff ? default_rest_days($staff) : 0;
    } else {
        $quota = (float)$att['should_rest_days'];
    }
    $remaining = $quota - $used - $pending;
    return array(
        'quota' => $quota,
        'used' => $used,
        'pending' => $pending,
        'remaining' => round($remaining, 2),
        'unused' => round($quota - $used, 2),
        'byType' => $byType,
        'list' => array_map('leave_out', $rows)
    );
}

function expiry_info($staff)
{
    $cfg = settings_data();
    $expiry = isset($cfg['expiry']) ? $cfg['expiry'] : array('healthCert' => 30, 'idCard' => 60);
    $calc = function ($date, $threshold) {
        if (!$date) return array('state' => 'none', 'days' => null);
        $days = diff_days($date, today_d());
        if ($days < 0) return array('state' => 'expired', 'days' => $days);
        if ($days <= $threshold) return array('state' => 'soon', 'days' => $days);
        return array('state' => 'ok', 'days' => $days);
    };
    return array(
        'health' => $calc($staff['health_cert_expiry'], (int)$expiry['healthCert']),
        'id' => $calc($staff['id_card_expiry'], (int)$expiry['idCard'])
    );
}

function calc_salary($o)
{
    $income = array('baseSalary', 'postAllowance', 'performancePay', 'fullAttendance', 'dailyOvertimePay', 'statutoryHolidayPay', 'mealSubsidy', 'transportSubsidy', 'attendanceSubsidy', 'socialSubsidy', 'commission');
    $deduct = array('inventoryDeduction', 'lateDeduction', 'attendanceDiff', 'leaveDeduction', 'disciplineDeduction', 'otherDeduction', 'insurance', 'tax');
    $gross = 0;
    foreach ($income as $k) $gross += isset($o[$k]) ? (float)$o[$k] : 0;
    $ded = 0;
    foreach ($deduct as $k) $ded += isset($o[$k]) ? (float)$o[$k] : 0;
    return array(
        'grossPay' => round($gross, 2),
        'deductionTotal' => round($ded, 2),
        'netPay' => round($gross - $ded, 2)
    );
}

function salary_out($r)
{
    if (!$r) return null;
    $money = array(
        'shouldDays' => 'should_days', 'actualDays' => 'actual_days', 'totalHours' => 'total_hours',
        'baseSalary' => 'base_salary', 'postAllowance' => 'post_allowance', 'performancePay' => 'performance_pay',
        'fullAttendance' => 'full_attendance', 'dailyOvertimePay' => 'daily_overtime_pay',
        'statutoryHolidayPay' => 'statutory_holiday_pay', 'mealSubsidy' => 'meal_subsidy',
        'transportSubsidy' => 'transport_subsidy', 'attendanceSubsidy' => 'attendance_subsidy',
        'socialSubsidy' => 'social_subsidy', 'commission' => 'commission', 'grossPay' => 'gross_pay',
        'inventoryDeduction' => 'inventory_deduction', 'lateDeduction' => 'late_deduction',
        'attendanceDiff' => 'attendance_diff', 'leaveDeduction' => 'leave_deduction',
        'disciplineDeduction' => 'discipline_deduction', 'otherDeduction' => 'other_deduction',
        'insurance' => 'insurance', 'tax' => 'tax', 'deductionTotal' => 'deduction_total', 'netPay' => 'net_pay'
    );
    $out = array(
        'id' => $r['id'], 'staffId' => $r['staff_id'], 'month' => $r['month'],
        'disciplineReason' => $r['discipline_reason'], 'otherReason' => $r['other_reason'],
        'payStatus' => $r['pay_status'], 'payDate' => $r['pay_date'] ? $r['pay_date'] : '',
        'publishAt' => iso($r['publish_at']), 'publishedBy' => $r['published_by'],
        'hidden' => (bool)$r['hidden'], 'remark' => $r['remark'],
        'updatedBy' => $r['updated_by'], 'updatedAt' => iso($r['updated_at'])
    );
    foreach ($money as $jsKey => $col) {
        $out[$jsKey] = $r[$col] === null ? null : (float)$r[$col];
    }
    return $out;
}

function score_out($r)
{
    if (!$r) return null;
    return array(
        'id' => $r['id'], 'staffId' => $r['staff_id'], 'month' => $r['month'],
        'dims' => json_field($r['dims_json'], array()),
        'adjust' => json_field($r['adjust_json'], array()),
        'total' => (float)$r['total'], 'grade' => $r['grade'], 'status' => $r['status'],
        'publishAt' => iso($r['publish_at']), 'publishedBy' => $r['published_by'],
        'updatedBy' => $r['updated_by'], 'updatedAt' => iso($r['updated_at'])
    );
}

function grade_of_total($total, $settings = null)
{
    if ($settings === null) $settings = settings_data();
    $grades = isset($settings['grades']) ? $settings['grades'] : array();
    usort($grades, function ($a, $b) { return $b['min'] - $a['min']; });
    foreach ($grades as $g) {
        if ($total >= $g['min']) return $g['key'];
    }
    return count($grades) ? $grades[count($grades) - 1]['key'] : 'D';
}

function id_card_valid($id)
{
    $id = strtoupper(trim((string)$id));
    if (!preg_match('/^[1-9]\d{16}[\dX]$/', $id)) return false;
    $w = array(7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2);
    $codes = array('1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2');
    $sum = 0;
    for ($i = 0; $i < 17; $i++) $sum += (int)$id[$i] * $w[$i];
    return $codes[$sum % 11] === $id[17];
}

function normalize_files($files)
{
    $out = array('idFront' => '', 'idBack' => '', 'photo' => '', 'healthCert' => '');
    if (!is_array($files)) return $out;
    foreach ($out as $k => $v) {
        if (isset($files[$k]) && is_string($files[$k])) {
            $s = trim($files[$k]);
            if ($s !== '' && preg_match('/^[A-Za-z0-9_\-\/\.]+$/', $s) && strpos($s, '..') === false) {
                $out[$k] = str_limit($s, 120);
            }
        }
    }
    return $out;
}

function client_ip()
{
    return isset($_SERVER['REMOTE_ADDR']) ? substr((string)$_SERVER['REMOTE_ADDR'], 0, 45) : '';
}

/* App Token 鉴权：与 Session 并存 */
require_once __DIR__ . '/token_auth.php';
