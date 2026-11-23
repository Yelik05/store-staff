<?php
/* install.php — 一键安装向导（环境检测 → 数据库 → 建表 → 超级管理员 → 演示数据 → 生成 config.php） */

define('APP_ROOT', __DIR__);
define('INSTALL_VERSION', '1.0.0');

@ini_set('display_errors', '1');
error_reporting(E_ALL);
date_default_timezone_set('Asia/Shanghai');
@session_name('TSINSTALL');
@session_start();

function h($s)
{
    return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
}

function env_checks()
{
    $root = APP_ROOT;
    $upload = $root . '/uploads';
    if (!is_dir($upload)) @mkdir($upload, 0755, true);
    return array(
        array('name' => 'PHP 版本', 'need' => '7.4 及以上', 'value' => PHP_VERSION, 'ok' => PHP_VERSION_ID >= 70400),
        array('name' => 'PDO 扩展', 'need' => '已启用', 'value' => extension_loaded('pdo') ? '已启用' : '未启用', 'ok' => extension_loaded('pdo')),
        array('name' => 'PDO MySQL 驱动', 'need' => '已启用', 'value' => extension_loaded('pdo_mysql') ? '已启用' : '未启用', 'ok' => extension_loaded('pdo_mysql')),
        array('name' => 'Fileinfo 扩展', 'need' => '可选（缺失时自动降级）', 'value' => extension_loaded('fileinfo') ? '已启用' : '未启用，将使用文件头校验', 'ok' => true, 'optional' => true),
        array('name' => '根目录可写', 'need' => '可写（生成 config.php）', 'value' => is_writable($root) ? '可写' : '不可写', 'ok' => is_writable($root)),
        array('name' => 'uploads 目录', 'need' => '存在且可写', 'value' => is_dir($upload) ? (is_writable($upload) ? '可写' : '不可写') : '不存在', 'ok' => is_dir($upload) && is_writable($upload)),
        array('name' => 'schema.sql', 'need' => '存在', 'value' => is_file($root . '/schema.sql') ? '已找到' : '缺失', 'ok' => is_file($root . '/schema.sql'))
    );
}

function all_ok($checks)
{
    foreach ($checks as $c) if (!$c['ok']) return false;
    return true;
}

function split_sql($sql)
{
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $out = array();
    $buf = '';
    $inS = false;
    $inD = false;
    $inB = false;
    $len = strlen($sql);
    for ($i = 0; $i < $len; $i++) {
        $ch = $sql[$i];
        if ($inS) {
            $buf .= $ch;
            if ($ch === '\\' && $i + 1 < $len) {
                $buf .= $sql[$i + 1];
                $i++;
            } elseif ($ch === "'") {
                $inS = false;
            }
            continue;
        }
        if ($inD) {
            $buf .= $ch;
            if ($ch === '\\' && $i + 1 < $len) {
                $buf .= $sql[$i + 1];
                $i++;
            } elseif ($ch === '"') {
                $inD = false;
            }
            continue;
        }
        if ($inB) {
            $buf .= $ch;
            if ($ch === '`') $inB = false;
            continue;
        }
        if ($ch === "'") { $inS = true; $buf .= $ch; continue; }
        if ($ch === '"') { $inD = true; $buf .= $ch; continue; }
        if ($ch === '`') { $inB = true; $buf .= $ch; continue; }
        if ($ch === ';') {
            if (trim($buf) !== '') $out[] = trim($buf);
            $buf = '';
            continue;
        }
        $buf .= $ch;
    }
    if (trim($buf) !== '') $out[] = trim($buf);
    return $out;
}

function table_exists($pdo, $db, $table)
{
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?');
    $st->execute(array($db, $table));
    return (int)$st->fetchColumn() > 0;
}

function write_config($db, $app)
{
    $content = "<?php\n"
        . "/* config.php — 由 install.php 自动生成于 " . date('Y-m-d H:i:s') . "，请勿通过 Web 直接访问 */\n"
        . "return " . var_export(array('db' => $db, 'app' => $app), true) . ";\n";
    $file = APP_ROOT . '/config.php';
    $ok = @file_put_contents($file, $content, LOCK_EX);
    if (!$ok) return false;
    @chmod($file, 0644);
    return true;
}

$configExists = is_file(APP_ROOT . '/config.php');
$step = isset($_GET['step']) ? (int)$_GET['step'] : 1;
$checks = env_checks();
$envOk = all_ok($checks);
$errors = array();
$success = null;

if (!$configExists && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['do_install'])) {
    $token = isset($_POST['token']) ? (string)$_POST['token'] : '';
    if (empty($_SESSION['install_token']) || !hash_equals((string)$_SESSION['install_token'], $token)) {
        $errors[] = '页面已过期，请刷新后重新填写。';
    } elseif (!$envOk) {
        $errors[] = '服务器环境未满足安装条件，请先处理环境检测中的问题。';
    } else {
        $host = trim(isset($_POST['db_host']) ? (string)$_POST['db_host'] : 'localhost');
        $port = (int)(isset($_POST['db_port']) ? $_POST['db_port'] : 3306);
        $name = trim(isset($_POST['db_name']) ? (string)$_POST['db_name'] : '');
        $user = trim(isset($_POST['db_user']) ? (string)$_POST['db_user'] : '');
        $pass = (string)(isset($_POST['db_pass']) ? $_POST['db_pass'] : '');
        $adminName = trim(isset($_POST['admin_name']) ? (string)$_POST['admin_name'] : '陈晓岚');
        $adminPhone = trim(isset($_POST['admin_phone']) ? (string)$_POST['admin_phone'] : '');
        $adminPass = (string)(isset($_POST['admin_pass']) ? $_POST['admin_pass'] : '');
        $adminPass2 = (string)(isset($_POST['admin_pass2']) ? $_POST['admin_pass2'] : '');
        $withDemo = !empty($_POST['with_demo']);

        if ($name === '' || !preg_match('/^[A-Za-z0-9_]+$/', $name)) $errors[] = '数据库名只能包含字母、数字与下划线。';
        if ($host === '') $errors[] = '请填写数据库主机地址。';
        if ($port < 1 || $port > 65535) $errors[] = '数据库端口不正确。';
        if ($user === '') $errors[] = '请填写数据库用户名。';
        if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z]{2,20}$/u', $adminName)) $errors[] = '管理员姓名需为 2—20 个中英文字符。';
        if (!preg_match('/^1[3-9]\d{9}$/', $adminPhone)) $errors[] = '请输入正确的 11 位管理员手机号。';
        if (!preg_match('/^.{6,20}$/', $adminPass) || !preg_match('/[A-Za-z]/', $adminPass) || !preg_match('/\d/', $adminPass)) {
            $errors[] = '管理员密码需 6—20 位，且包含字母和数字。';
        }
        if ($adminPass !== $adminPass2) $errors[] = '两次输入的管理员密码不一致。';

        $pdo = null;
        if (!$errors) {
            try {
                $pdo = new PDO('mysql:host=' . $host . ';port=' . $port . ';charset=utf8mb4', $user, $pass, array(
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ));
                $pdo->exec('SET NAMES utf8mb4');
            } catch (PDOException $e) {
                $errors[] = '数据库连接失败：' . $e->getMessage() . '（请核对主机、端口、用户名与密码）';
            }
        }

        if (!$errors && $pdo) {
            try {
                $pdo->exec('CREATE DATABASE IF NOT EXISTS `' . $name . '` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
                $pdo->exec('USE `' . $name . '`');
                $sql = file_get_contents(APP_ROOT . '/schema.sql');
                $statements = split_sql($sql);
                foreach ($statements as $stmt) {
                    $pdo->exec($stmt);
                }

                $hash = password_hash($adminPass, PASSWORD_DEFAULT);
                $now = date('Y-m-d H:i:s');
                $st = $pdo->prepare('SELECT id FROM staff WHERE id = ?');
                $st->execute(array('S001'));
                if ($st->fetch()) {
                    $q = $pdo->prepare('UPDATE staff SET name = ?, phone = ?, status = \'active\', reviewed_by = \'安装向导\', reviewed_at = ?, updated_at = ? WHERE id = ?');
                    $q->execute(array($adminName, $adminPhone, $now, $now, 'S001'));
                } else {
                    $q = $pdo->prepare("INSERT INTO staff (id, name, gender, id_card, birth, phone, address, position, employment_type, hire_date, id_card_expiry, health_cert_expiry, emergency, emp_no, status, remark, files_json, created_at, updated_at, submitted_at, reviewed_by, reviewed_at, reject_reason) VALUES ('S001', ?, '女', NULL, NULL, ?, '管理组账号，资料待补全', '店长', '全职', ?, NULL, ?, '', 'TA0051-001', 'active', '系统初始超级管理员', '{}', ?, ?, ?, '安装向导', ?, '')");
                    $q->execute(array($adminName, $adminPhone, date('Y-m-d'), date('Y-m-d', strtotime('+365 days')), $now, $now, $now, $now));
                }

                $st = $pdo->prepare('SELECT id FROM accounts WHERE phone = ? AND id <> ?');
                $st->execute(array($adminPhone, 'A001'));
                if ($st->fetch()) $errors[] = '该手机号已被其他账号使用，请更换管理员手机号。';

                if (!$errors) {
                    $st = $pdo->prepare('SELECT id FROM accounts WHERE id = ?');
                    $st->execute(array('A001'));
                    if ($st->fetch()) {
                        $q = $pdo->prepare('UPDATE accounts SET phone = ?, name = ?, role = \'superadmin\', staff_id = \'S001\', status = \'active\', password_hash = ?, first_login = 0 WHERE id = \'A001\'');
                        $q->execute(array($adminPhone, $adminName, $hash));
                    } else {
                        $q = $pdo->prepare("INSERT INTO accounts (id, phone, name, role, staff_id, status, password_hash, first_login, created_at, last_login_at) VALUES ('A001', ?, ?, 'superadmin', 'S001', 'active', ?, 0, ?, NULL)");
                        $q->execute(array($adminPhone, $adminName, $hash, $now));
                    }
                }

                if (!$errors) {
                    $cfgDb = array('host' => $host, 'port' => $port, 'name' => $name, 'user' => $user, 'pass' => $pass, 'charset' => 'utf8mb4');
                    $cfgApp = array('timezone' => 'Asia/Shanghai', 'session_name' => 'TSSTAFFSID', 'upload_max_mb' => 20);
                    if (!write_config($cfgDb, $cfgApp)) {
                        $errors[] = 'config.php 写入失败，请确认网站根目录可写（Linux 一般为 755 / 属主为 Web 用户）。';
                    }
                }

                if (!$errors) {
                    $demoResult = null;
                    if ($withDemo) {
                        try {
                            require_once APP_ROOT . '/lib/bootstrap.php';
                            require_once APP_ROOT . '/lib/demo.php';
                            $demoResult = demo_import(array('S001'));
                        } catch (Exception $e) {
                            $errors[] = '演示数据导入失败：' . $e->getMessage() . '（系统已完成安装，可登录后在“系统设置”中重置演示数据）';
                        }
                    }
                    $success = array(
                        'adminName' => $adminName,
                        'adminPhone' => $adminPhone,
                        'demo' => $withDemo && $demoResult !== null,
                        'demoResult' => $demoResult,
                        'db' => $name
                    );
                    $_SESSION = array();
                }
            } catch (Exception $e) {
                $errors[] = '安装过程出错：' . $e->getMessage();
            }
        }
    }
}

if (empty($_SESSION['install_token'])) {
    $_SESSION['install_token'] = bin2hex(function_exists('random_bytes') ? random_bytes(16) : md5(uniqid('', true)));
}
$token = $_SESSION['install_token'];
$installed = $success !== null;
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>安装向导 · 塔斯汀门店人员管理系统</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f4f5f7;color:#1f2329;line-height:1.6}
.wrap{max-width:880px;margin:0 auto;padding:36px 20px 60px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
.mark{width:46px;height:46px;border-radius:12px;background:#C8102E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px}
.brand h1{font-size:20px;margin:0}
.brand p{margin:2px 0 0;color:#6b7280;font-size:13px}
.card{background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px rgba(16,24,40,.05);padding:26px 26px 24px;margin-bottom:18px}
h2{font-size:17px;margin:0 0 6px}
.desc{color:#6b7280;font-size:13px;margin:0 0 18px}
.steps{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.step{font-size:12px;padding:6px 12px;border-radius:999px;background:#eef0f3;color:#6b7280}
.step.on{background:#C8102E;color:#fff}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #eef0f3}
th{color:#6b7280;font-weight:500}
.ok{color:#0f9d58;font-weight:600}
.bad{color:#d93025;font-weight:600}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
label{display:block;font-size:13px;margin-bottom:5px;color:#374151}
input[type=text],input[type=password],input[type=number]{width:100%;height:40px;border:1px solid #d7dbe0;border-radius:9px;padding:0 12px;font-size:14px;background:#fff}
input:focus{outline:none;border-color:#C8102E;box-shadow:0 0 0 3px rgba(200,16,46,.12)}
.hint{font-size:12px;color:#8a9099;margin-top:5px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 22px;border-radius:10px;border:0;background:#C8102E;color:#fff;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none}
.btn:hover{background:#a80d26}
.btn.ghost{background:#fff;color:#374151;border:1px solid #d7dbe0}
.btn.ghost:hover{background:#f7f8fa}
.actions{display:flex;gap:12px;align-items:center;margin-top:20px;flex-wrap:wrap}
.alert{border-radius:10px;padding:12px 14px;font-size:13px;margin-bottom:14px}
.alert.err{background:#fdecea;color:#a50e0e;border:1px solid #f6c9c4}
.alert.ok{background:#e9f7ef;color:#0b6b3a;border:1px solid #b7e1c4}
.alert.warn{background:#fff8e6;color:#7a5a00;border:1px solid #f3dfa8}
code{background:#f3f4f6;padding:2px 6px;border-radius:5px;font-size:12px}
.checkbox{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:#374151}
.checkbox input{margin-top:3px}
.mono{font-family:Consolas,Monaco,monospace}
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <div class="mark">塔</div>
    <div>
      <h1>门店人员管理系统 · 安装向导</h1>
      <p>PHP <?php echo h(PHP_VERSION); ?> · MySQL 5.7+ / 8.0 · 无需 Composer</p>
    </div>
  </div>

  <div class="steps">
    <span class="step <?php echo ($step <= 1 && !$installed) ? 'on' : ''; ?>">1 环境检测</span>
    <span class="step <?php echo ($step === 2 && !$installed) ? 'on' : ''; ?>">2 数据库与管理员</span>
    <span class="step <?php echo $installed ? 'on' : ''; ?>">3 建表与完成</span>
  </div>

<?php if ($configExists && !$installed): ?>
  <div class="card">
    <h2>系统已安装</h2>
    <p class="desc">检测到根目录已存在 <code>config.php</code>，为避免覆盖数据，安装向导已锁定。</p>
    <div class="alert warn">如需重新安装，请先备份数据并删除 <code>config.php</code>（以及数据库中的表），然后刷新本页。</div>
    <div class="actions">
      <a class="btn" href="login.html">进入系统登录</a>
    </div>
    <p class="hint" style="margin-top:16px">安全提示：安装完成后请删除 <code>install.php</code>。</p>
  </div>
<?php elseif ($installed): ?>
  <div class="card">
    <h2>安装完成</h2>
    <?php if ($errors): ?>
      <div class="alert err"><?php echo h(implode(' ', $errors)); ?></div>
    <?php endif; ?>
    <div class="alert ok">数据库 <code><?php echo h($success['db']); ?></code> 已创建，数据表与超级管理员已就绪，<code>config.php</code> 已生成。</div>
    <table>
      <tr><th style="width:150px">管理员姓名</th><td><?php echo h($success['adminName']); ?></td></tr>
      <tr><th>登录手机号</th><td class="mono"><?php echo h($success['adminPhone']); ?></td></tr>
      <tr><th>登录密码</th><td>你在上一步设置的密码</td></tr>
      <tr><th>演示数据</th><td><?php echo $success['demo'] ? '已导入（含 11 名演示员工）' : '未导入'; ?></td></tr>
      <?php if (!empty($success['demoResult'])): ?>
      <tr><th>导入统计</th><td><?php
          $parts = array();
          foreach ($success['demoResult'] as $k => $v) $parts[] = $k . ' ' . $v;
          echo h(implode('，', $parts));
      ?></td></tr>
      <?php endif; ?>
    </table>
    <?php if ($success['demo']): ?>
      <div class="alert warn" style="margin-top:16px">
        演示账号：管理组 <span class="mono">13800000002 / admin123</span>；员工 <span class="mono">13900000001 / a123456</span>。
        正式使用前请在“系统设置 → 演示数据维护”中清空或重置。
      </div>
    <?php endif; ?>
    <div class="alert err" style="margin-top:16px">
      <strong>重要：</strong>请立即通过 FTP / 文件管理器删除根目录下的 <code>install.php</code>，避免他人重新安装或探测环境。
    </div>
    <div class="actions">
      <a class="btn" href="login.html">进入登录页</a>
    </div>
  </div>
<?php elseif ($step === 2): ?>
  <div class="card">
    <h2>数据库与超级管理员</h2>
    <p class="desc">填写虚拟主机提供的 MySQL 连接信息。系统将自动创建数据库（若不存在）、执行 schema.sql 并创建店长账号。</p>
    <?php if ($errors): ?>
      <div class="alert err"><?php echo h(implode(' ', $errors)); ?></div>
    <?php endif; ?>
    <form method="post" action="install.php?step=2" autocomplete="off">
      <input type="hidden" name="token" value="<?php echo h($token); ?>">
      <input type="hidden" name="do_install" value="1">
      <h2 style="font-size:14px;margin:6px 0 12px">数据库连接</h2>
      <div class="grid">
        <div><label>数据库主机 *</label><input type="text" name="db_host" value="<?php echo h(isset($_POST['db_host']) ? $_POST['db_host'] : 'localhost'); ?>" placeholder="localhost"><div class="hint">虚拟主机通常为 localhost 或 127.0.0.1</div></div>
        <div><label>端口 *</label><input type="number" name="db_port" value="<?php echo h(isset($_POST['db_port']) ? $_POST['db_port'] : '3306'); ?>"></div>
        <div><label>数据库名 *</label><input type="text" name="db_name" value="<?php echo h(isset($_POST['db_name']) ? $_POST['db_name'] : ''); ?>" placeholder="store_staff"><div class="hint">仅字母、数字、下划线；不存在时自动创建</div></div>
        <div><label>数据库用户名 *</label><input type="text" name="db_user" value="<?php echo h(isset($_POST['db_user']) ? $_POST['db_user'] : ''); ?>"></div>
        <div><label>数据库密码</label><input type="password" name="db_pass" value=""></div>
      </div>

      <h2 style="font-size:14px;margin:24px 0 12px">超级管理员（店长）</h2>
      <div class="grid">
        <div><label>姓名 *</label><input type="text" name="admin_name" value="<?php echo h(isset($_POST['admin_name']) ? $_POST['admin_name'] : '陈晓岚'); ?>"></div>
        <div><label>登录手机号 *</label><input type="text" name="admin_phone" maxlength="11" value="<?php echo h(isset($_POST['admin_phone']) ? $_POST['admin_phone'] : '13800000001'); ?>"></div>
        <div><label>登录密码 *</label><input type="password" name="admin_pass" value=""><div class="hint">6—20 位，需包含字母和数字</div></div>
        <div><label>确认密码 *</label><input type="password" name="admin_pass2" value=""></div>
      </div>

      <div class="checkbox" style="margin-top:16px">
        <input type="checkbox" id="with_demo" name="with_demo" value="1" <?php echo isset($_POST['with_demo']) ? 'checked' : 'checked'; ?>>
        <label for="with_demo" style="margin:0">导入演示数据（11 名员工、近 3 个月薪资与量化分、排休与台账；便于验收后清空）</label>
      </div>

      <div class="actions">
        <button class="btn" type="submit">开始安装</button>
        <a class="btn ghost" href="install.php?step=1">返回环境检测</a>
      </div>
    </form>
  </div>
<?php else: ?>
  <div class="card">
    <h2>环境检测</h2>
    <p class="desc">必需项全部通过后才能继续。若某项不满足，请联系虚拟主机服务商或在主机控制面板中调整 PHP 版本 / 扩展 / 目录权限。Fileinfo 为可选项，未启用时上传校验会自动降级为文件头检测，不影响使用。</p>
    <table>
      <?php foreach ($checks as $c): ?>
      <tr>
        <td style="width:180px"><?php echo h($c['name']); ?></td>
        <td style="width:220px;color:#6b7280"><?php echo h($c['need']); ?></td>
        <td><?php echo h($c['value']); ?></td>
        <td style="width:80px" class="<?php echo $c['ok'] ? 'ok' : 'bad'; ?>"><?php echo $c['ok'] ? (!empty($c['optional']) ? '通过（可选）' : '通过') : '未通过'; ?></td>
      </tr>
      <?php endforeach; ?>
    </table>
    <div class="actions">
      <?php if ($envOk): ?>
        <a class="btn" href="install.php?step=2">下一步：数据库配置</a>
      <?php else: ?>
        <span class="bad">请先处理未通过项，然后刷新本页。</span>
        <a class="btn ghost" href="install.php">重新检测</a>
      <?php endif; ?>
    </div>
    <p class="hint" style="margin-top:18px">目录权限参考：Linux 虚拟主机将 <code>uploads</code> 设为 755（或 775），属主为 Web 运行用户；Windows 主机需给 <code>uploads</code> 目录写入权限。</p>
  </div>
<?php endif; ?>
</div>
</body>
</html>
