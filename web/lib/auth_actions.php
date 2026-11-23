<?php
/* auth_actions.php — 启动数据、登录会话、注册、账号与日志 */

function api_auth_bootstrap($in)
{
    app_session_start();
    $acc = current_account();
    $staff = $acc ? staff_by_id($acc['staff_id']) : null;
    $session = null;
    if ($acc) {
        $session = array(
            'token' => substr(sha1(session_id() . '|' . $acc['id']), 0, 32),
            'accountId' => $acc['id'],
            'role' => $acc['role'],
            'staffId' => $acc['staff_id'],
            'name' => $acc['name'],
            'phone' => $acc['phone'],
            'empNo' => $staff ? (string)$staff['emp_no'] : '',
            'feishuEmpNo' => $staff ? (string)$staff['feishu_emp_no'] : '',
            'loginAt' => !empty($_SESSION['login_at']) ? $_SESSION['login_at'] : iso($acc['last_login_at']),
            'expiresAt' => !empty($_SESSION['remember']) ? date('c', time() + 7 * 86400) : null
        );
    }
    $accounts = array();
    if ($acc && ($acc['role'] === 'admin' || $acc['role'] === 'superadmin')) {
        $rows = db()->query("SELECT * FROM accounts ORDER BY FIELD(role,'superadmin','admin','staff'), name")->fetchAll();
        $accounts = array_map('account_out', $rows);
    }
    return array(
        'session' => $session,
        'staff' => $staff ? staff_out($staff) : null,
        'store' => store_info(),
        'settings' => settings_data(),
        'nextEmpNo' => ($acc && $acc['role'] !== 'staff') ? next_emp_no() : '',
        'accounts' => $accounts
    );
}

function api_auth_login($in)
{
    app_session_start();
    $phone = trim((string)(isset($in['phone']) ? $in['phone'] : ''));
    $password = (string)(isset($in['password']) ? $in['password'] : '');
    if (!preg_match('/^1[3-9]\d{9}$/', $phone)) throw new ApiException('请输入正确的 11 位手机号');
    if ($password === '') throw new ApiException('请输入密码');

    $st = db()->prepare('SELECT * FROM login_locks WHERE phone = ?');
    $st->execute(array($phone));
    $lock = $st->fetch();
    if ($lock && $lock['lock_until'] && strtotime($lock['lock_until']) > time()) {
        $mins = (int)ceil((strtotime($lock['lock_until']) - time()) / 60);
        throw new ApiException('尝试次数过多，请 ' . $mins . ' 分钟后重试或联系店长', 'LOCKED', 400);
    }

    $st = db()->prepare('SELECT * FROM accounts WHERE phone = ?');
    $st->execute(array($phone));
    $acc = $st->fetch();

    $ok = $acc && $acc['password_hash'] !== '!install' && password_verify($password, $acc['password_hash']);
    if (!$ok) {
        if ($acc) {
            $fails = $lock ? ((int)$lock['fails'] + 1) : 1;
            if ($fails >= 5) {
                $until = date('Y-m-d H:i:s', time() + 15 * 60);
                $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,0,?,?)');
                $q->execute(array($phone, $until, now_dt()));
                throw new ApiException('尝试次数过多，请 15 分钟后重试或联系店长', 'LOCKED', 400);
            }
            $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,?,NULL,?)');
            $q->execute(array($phone, $fails, now_dt()));
        }
        throw new ApiException('手机号或密码不正确', 'BAD_CREDENTIALS', 400);
    }

    $staff = staff_by_id($acc['staff_id']);
    if ($acc['status'] === 'disabled') {
        if ($staff && $staff['status'] === 'resigned') {
            throw new ApiException('账号已停用，如需查询历史薪资请联系店长', 'DISABLED', 403);
        }
        throw new ApiException('账号已停用，请联系店长', 'DISABLED', 403);
    }

    $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,0,NULL,?)');
    $q->execute(array($phone, now_dt()));
    $q = db()->prepare('UPDATE accounts SET last_login_at = ?, first_login = 0 WHERE id = ?');
    $q->execute(array(now_dt(), $acc['id']));

    session_regenerate_id(true);
    $_SESSION['account_id'] = $acc['id'];
    $_SESSION['role'] = $acc['role'];
    $_SESSION['staff_id'] = $acc['staff_id'];
    $_SESSION['name'] = $acc['name'];
    $_SESSION['phone'] = $acc['phone'];
    $_SESSION['login_at'] = date('c');
    $_SESSION['remember'] = in_bool($in, 'remember');

    if (!empty($_SESSION['remember'])) {
        $secure = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off');
        @setcookie(session_name(), session_id(), array(
            'expires' => time() + 7 * 86400,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax'
        ));
    }

    audit_log('登录系统', $acc['name'], '角色：' . $acc['role']);
    $session = array(
        'token' => substr(sha1(session_id() . '|' . $acc['id']), 0, 32),
        'accountId' => $acc['id'],
        'role' => $acc['role'],
        'staffId' => $acc['staff_id'],
        'name' => $acc['name'],
        'phone' => $acc['phone'],
        'empNo' => $staff ? (string)$staff['emp_no'] : '',
        'feishuEmpNo' => $staff ? (string)$staff['feishu_emp_no'] : '',
        'loginAt' => $_SESSION['login_at'],
        'expiresAt' => !empty($_SESSION['remember']) ? date('c', time() + 7 * 86400) : null
    );
    return array(
        'token' => $session['token'],
        'role' => $acc['role'],
        'session' => $session,
        'user' => array(
            'id' => $acc['staff_id'],
            'name' => $acc['name'],
            'status' => $staff ? $staff['status'] : 'active',
            'position' => $staff ? normalize_position($staff['position']) : '',
            'empNo' => $staff ? ($staff['emp_no'] ? $staff['emp_no'] : '') : ''
        )
    );
}

function api_auth_logout($in)
{
    app_session_start();
    $acc = current_account();
    if ($acc) audit_log('退出登录', $acc['name'], '');
    session_destroy_now();
    return array('ok' => true);
}

function api_staff_me($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    return staff_out($staff);
}

function api_auth_register($in)
{
    app_session_start();
    $name = in_str($in, 'name', 40);
    if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z]{2,20}$/u', $name)) {
        throw new ApiException('请输入 2—20 个字的姓名，不要包含数字或符号');
    }
    $phone = trim((string)(isset($in['phone']) ? $in['phone'] : ''));
    if (!preg_match('/^1[3-9]\d{9}$/', $phone)) throw new ApiException('请输入正确的 11 位手机号');
    $password = (string)(isset($in['password']) ? $in['password'] : '');
    if (!preg_match('/^.{6,20}$/', $password) || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        throw new ApiException('密码需 6—20 位，且包含字母和数字');
    }
    $idCard = strtoupper(trim((string)(isset($in['idCard']) ? $in['idCard'] : '')));
    if (!id_card_valid($idCard)) throw new ApiException('该身份证号校验未通过，请检查是否输入正确');
    $address = in_str($in, 'address', 80);
    if (strlen($address) < 5 || preg_match('/^\d+$/', $address)) {
        throw new ApiException('现居住地址请填写到具体门牌，不少于 5 个字');
    }
    $hireDate = in_str($in, 'hireDate', 10);
    if (!$hireDate) throw new ApiException('请选择入职日期');
    $hd = diff_days($hireDate, today_d());
    if (diff_days($hireDate, '2010-01-01') < 0 || $hd > 30) throw new ApiException('入职日期超出可填写范围，请核对');
    $health = in_str($in, 'healthCertExpiry', 10);
    if (!$health || diff_days($health, today_d()) < 0) throw new ApiException('健康证已过期或未填写有效期，请补充');
    $idExpiry = in_str($in, 'idCardExpiry', 10);
    if ($idExpiry && diff_days($idExpiry, today_d()) < 0) throw new ApiException('该身份证已过期，请更换后再提交');

    $st = db()->prepare('SELECT id FROM accounts WHERE phone = ?');
    $st->execute(array($phone));
    if ($st->fetch()) throw new ApiException('该手机号已注册，请直接登录或联系店长');
    $st = db()->prepare("SELECT id FROM staff WHERE phone = ? AND status IN ('draft','pending','active','disabled')");
    $st->execute(array($phone));
    if ($st->fetch()) throw new ApiException('该手机号已注册，请直接登录或联系店长');
    $st = db()->prepare("SELECT id FROM staff WHERE id_card = ? AND status IN ('draft','pending','active','disabled')");
    $st->execute(array($idCard));
    if ($st->fetch()) throw new ApiException('该身份证号已登记，请联系店长处理');

    $birth = in_str($in, 'birth', 10);
    if (!$birth) {
        $birth = substr($idCard, 6, 4) . '-' . substr($idCard, 10, 2) . '-' . substr($idCard, 12, 2);
    }
    $gender = in_str($in, 'gender', 4);
    if ($gender !== '男' && $gender !== '女') $gender = ((int)$idCard[16] % 2 === 1) ? '男' : '女';
    $position = normalize_position(in_str($in, 'position', 20, '店员'));
    $employment = in_str($in, 'employmentType', 10);
    if ($employment === '') $employment = '全职';

    $staffId = next_staff_id();
    $now = now_dt();
    db()->beginTransaction();
    try {
        $q = db()->prepare('INSERT INTO staff (id, name, gender, id_card, birth, phone, address, position, employment_type, hire_date, id_card_expiry, health_cert_expiry, emergency, emp_no, status, remark, files_json, created_at, updated_at, submitted_at, reviewed_by, reviewed_at, reject_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,NULL,?)');
        $q->execute(array(
            $staffId, $name, $gender, $idCard, $birth, $phone, $address, $position, $employment, $hireDate,
            $idExpiry ? $idExpiry : null, $health, in_str($in, 'emergency', 80), 'pending', '', json_encode(normalize_files(isset($in['files']) ? $in['files'] : array()), JSON_UNESCAPED_UNICODE),
            $now, $now, $now, '', ''
        ));
        $accId = next_account_id($staffId);
        $q = db()->prepare('INSERT INTO accounts (id, phone, name, role, staff_id, status, password_hash, first_login, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,1,?,NULL)');
        $q->execute(array($accId, $phone, $name, 'staff', $staffId, 'active', password_hash($password, PASSWORD_DEFAULT), $now));
        db()->commit();
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
    audit_log('提交注册', $name, '手机号 ' . $phone);
    return array('staffId' => $staffId, 'status' => 'pending');
}

function api_auth_check_unique($in)
{
    $out = array('phone' => true, 'idCard' => true);
    if (isset($in['phone']) && $in['phone'] !== '') {
        $phone = trim((string)$in['phone']);
        $st = db()->prepare('SELECT id FROM accounts WHERE phone = ?');
        $st->execute(array($phone));
        $hit = $st->fetch();
        if (!$hit) {
            $st = db()->prepare("SELECT id FROM staff WHERE phone = ? AND status IN ('draft','pending','active','disabled')");
            $st->execute(array($phone));
            $hit = $st->fetch();
        }
        if ($hit) {
            $out['phone'] = false;
            $out['message'] = '该手机号已注册，请直接登录或联系店长';
        }
    }
    if (isset($in['idCard']) && $in['idCard'] !== '') {
        $st = db()->prepare("SELECT id FROM staff WHERE id_card = ? AND status IN ('draft','pending','active','disabled')");
        $st->execute(array(strtoupper(trim((string)$in['idCard']))));
        if ($st->fetch()) {
            $out['idCard'] = false;
            $out['message'] = '该身份证号已登记，请联系店长处理';
        }
    }
    return $out;
}

function api_auth_resubmit($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    if ($staff['status'] !== 'pending' && $staff['status'] !== 'rejected') {
        throw new ApiException('当前档案状态不可重新提交');
    }
    $name = in_str($in, 'name', 40, $staff['name']);
    if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z]{2,20}$/u', $name)) throw new ApiException('请输入 2—20 个字的姓名，不要包含数字或符号');
    $address = in_str($in, 'address', 80, $staff['address']);
    if (strlen($address) < 5 || preg_match('/^\d+$/', $address)) throw new ApiException('现居住地址请填写到具体门牌，不少于 5 个字');
    $hireDate = in_str($in, 'hireDate', 10, $staff['hire_date']);
    $hd = diff_days($hireDate, today_d());
    if (!$hireDate || diff_days($hireDate, '2010-01-01') < 0 || $hd > 30) throw new ApiException('入职日期超出可填写范围，请核对');
    $health = in_str($in, 'healthCertExpiry', 10, $staff['health_cert_expiry']);
    if (!$health || diff_days($health, today_d()) < 0) throw new ApiException('健康证已过期或未填写有效期，请补充');
    $idExpiry = in_str($in, 'idCardExpiry', 10, $staff['id_card_expiry']);
    if ($idExpiry && diff_days($idExpiry, today_d()) < 0) throw new ApiException('该身份证已过期，请更换后再提交');

    $files = isset($in['files']) ? normalize_files($in['files']) : staff_files($staff);
    $gender = in_str($in, 'gender', 4, $staff['gender']);
    if ($gender !== '男' && $gender !== '女') $gender = $staff['gender'];

    $st = db()->prepare('UPDATE staff SET name=?, gender=?, birth=?, address=?, position=?, employment_type=?, hire_date=?, id_card_expiry=?, health_cert_expiry=?, emergency=?, files_json=?, status=\'pending\', submitted_at=?, updated_at=?, reviewed_by=\'\', reviewed_at=NULL, reject_reason=\'\' WHERE id=?');
    $st->execute(array(
        $name, $gender, in_str($in, 'birth', 10, $staff['birth']), $address,
        normalize_position(in_str($in, 'position', 20, $staff['position'])), in_str($in, 'employmentType', 10, $staff['employment_type']),
        $hireDate, $idExpiry ? $idExpiry : null, $health, in_str($in, 'emergency', 80, $staff['emergency']),
        json_encode($files, JSON_UNESCAPED_UNICODE), now_dt(), now_dt(), $staff['id']
    ));
    $q = db()->prepare('UPDATE accounts SET name = ? WHERE staff_id = ?');
    $q->execute(array($name, $staff['id']));
    audit_log('重新提交资料', $name, '驳回后修改');
    return array('staffId' => $staff['id'], 'status' => 'pending');
}

function api_staff_update_me($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $field = in_str($in, 'field', 32);
    $map = array(
        'address' => '现居住地址', 'phone' => '手机号',
        'idFront' => '身份证正面', 'idBack' => '身份证反面', 'photo' => '白底一寸照',
        'healthCertExpiry' => '健康证有效期', 'healthCert' => '健康证文件'
    );
    if (!isset($map[$field])) throw new ApiException('该资料不支持在线提交，请联系店长');
    $newValue = in_str($in, 'newValue', 255);
    if ($field === 'address') {
        if (strlen($newValue) < 5) throw new ApiException('现居住地址请填写到具体门牌，不少于 5 个字');
    } elseif ($field === 'phone') {
        if (!preg_match('/^1[3-9]\d{9}$/', $newValue)) throw new ApiException('请输入正确的 11 位手机号');
        $st = db()->prepare('SELECT id FROM accounts WHERE phone = ? AND staff_id <> ?');
        $st->execute(array($newValue, $staff['id']));
        if ($st->fetch()) throw new ApiException('该手机号已被其他账号使用');
    } elseif ($field === 'healthCertExpiry') {
        if (!$newValue || diff_days($newValue, today_d()) < 0) throw new ApiException('健康证有效期需晚于今天');
    } elseif (in_array($field, array('idFront', 'idBack', 'photo', 'healthCert'), true)) {
        if ($newValue === '') throw new ApiException('请先上传附件');
        $checked = normalize_files(array($field => $newValue));
        if ($checked[$field] === '') throw new ApiException('附件地址不合法，请重新上传');
        if ($field === 'healthCert' && !preg_match('/\.(pdf|jpe?g|png|webp)$/i', $checked[$field])) {
            throw new ApiException('健康证需为图片或 PDF 文件');
        }
        if ($field !== 'healthCert' && !preg_match('/\.(jpe?g|png|webp)$/i', $checked[$field])) {
            throw new ApiException('该附件需为图片文件（JPG/PNG/WEBP）');
        }
        $st = db()->prepare('SELECT 1 FROM files WHERE file_key = ?');
        $st->execute(array($checked[$field]));
        if (!$st->fetchColumn()) throw new ApiException('附件不存在，请重新上传', 'UPLOAD_MISSING', 400);
        $newValue = $checked[$field];
    }
    if ($newValue === '') throw new ApiException('请填写更正后的内容');

    $oldMap = array('address' => 'address', 'healthCertExpiry' => 'health_cert_expiry', 'phone' => 'phone');
    if (in_array($field, array('idFront', 'idBack', 'photo', 'healthCert'), true)) {
        $old = (string)staff_files($staff)[$field];
    } else {
        $old = (string)$staff[$oldMap[$field]];
    }
    $id = next_correction_id();
    $st = db()->prepare('INSERT INTO corrections (id, staff_id, field, field_label, old_value, new_value, note, status, created_at, reviewed_by, reviewed_at, reject_reason) VALUES (?,?,?,?,?,?,?,\'pending\',?,\'\',NULL,\'\')');
    $st->execute(array($id, $staff['id'], $field, $map[$field], str_limit($old, 255), str_limit($newValue, 255), in_str($in, 'note', 255), now_dt()));
    audit_log('申请更正档案', $staff['name'], $map[$field] . ' → ' . $newValue);
    return array('status' => 'pending', 'id' => $id);
}

/**
 * 员工自助修改资料：仅允许非关键字段直接生效，关键字段一律拒绝并要求走更正审核。
 * 可直接修改：身份证号、身份证正反面/白底照/健康证附件、现居住地址、紧急联系人。
 * 关键字段（姓名、手机号、银行卡/工资卡、入职岗位、用工性质、入职日期、各类有效期等）需提交更正申请。
 */
function api_staff_save_me($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $reviewFields = array(
        'name' => '姓名', 'phone' => '手机号', 'bankCard' => '银行卡/工资卡',
        'position' => '入职岗位', 'employmentType' => '用工性质', 'hireDate' => '入职日期',
        'empNo' => '门店工号', 'status' => '档案状态',
        'healthCertExpiry' => '健康证有效期', 'idCardExpiry' => '身份证有效期'
    );
    foreach ($reviewFields as $k => $label) {
        if (isset($in[$k]) && !is_array($in[$k]) && (string)$in[$k] !== '') {
            throw new ApiException($label . '属于关键字段，需提交更正申请，由门店管理组审核后生效', 'NEED_REVIEW', 400);
        }
    }

    $sets = array();
    $args = array();
    $logs = array();

    if (array_key_exists('idCard', $in) && !is_array($in['idCard'])) {
        $idCard = strtoupper(trim((string)$in['idCard']));
        if ($idCard !== '' && $idCard !== (string)$staff['id_card']) {
            if (!id_card_valid($idCard)) throw new ApiException('身份证号格式或校验位不正确，请核对后重新填写');
            $st = db()->prepare('SELECT name FROM staff WHERE id_card = ? AND id <> ?');
            $st->execute(array($idCard, $staff['id']));
            $dup = $st->fetch();
            if ($dup) throw new ApiException('该身份证号已被其他档案使用，请到店联系店长处理');
            $sets[] = 'id_card = ?';
            $args[] = $idCard;
            $sets[] = 'birth = ?';
            $args[] = substr($idCard, 6, 4) . '-' . substr($idCard, 10, 2) . '-' . substr($idCard, 12, 2);
            $sets[] = 'gender = ?';
            $args[] = ((int)$idCard[16] % 2 === 1) ? '男' : '女';
            $logs[] = array('身份证号（同步更新出生日期与性别）', (string)$staff['id_card'], $idCard);
        }
    }

    if (array_key_exists('address', $in) && !is_array($in['address'])) {
        $address = trim((string)$in['address']);
        if ($address !== '' && strlen($address) < 5) throw new ApiException('现居住地址请填写到具体门牌，不少于 5 个字');
        if ($address !== (string)$staff['address']) {
            $sets[] = 'address = ?';
            $args[] = $address;
            $logs[] = array('现居住地址', (string)$staff['address'], $address);
        }
    }

    if (array_key_exists('emergency', $in) && !is_array($in['emergency'])) {
        $emergency = trim((string)$in['emergency']);
        if ($emergency !== (string)$staff['emergency']) {
            $sets[] = 'emergency = ?';
            $args[] = str_limit($emergency, 80);
            $logs[] = array('紧急联系人', (string)$staff['emergency'], $emergency);
        }
    }

    if (array_key_exists('nickname', $in) && !is_array($in['nickname'])) {
        $nick = trim((string)$in['nickname']);
        $nickLen = function_exists('mb_strlen') ? mb_strlen($nick, 'UTF-8') : strlen($nick);
        if ($nickLen > 20) throw new ApiException('昵称不能超过 20 个字');
        $oldNick = isset($staff['nickname']) ? (string)$staff['nickname'] : '';
        if ($nick !== $oldNick) {
            $sets[] = 'nickname = ?';
            $args[] = $nick;
            $logs[] = array('昵称', $oldNick, $nick);
        }
    }

    if (array_key_exists('avatar', $in) && !is_array($in['avatar'])) {
        $avatar = trim((string)$in['avatar']);
        if ($avatar !== '' && !preg_match('/\.(jpg|jpeg|png|webp|gif)$/i', $avatar)) {
            throw new ApiException('头像需为 JPG、PNG、WEBP 或 GIF 图片，请重新上传');
        }
        if ($avatar !== '') {
            $st = db()->prepare('SELECT 1 FROM files WHERE file_key = ?');
            $st->execute(array($avatar));
            if (!$st->fetchColumn()) throw new ApiException('头像文件不存在，请重新上传', 'UPLOAD_MISSING', 400);
        }
        $oldAvatar = isset($staff['avatar']) ? (string)$staff['avatar'] : '';
        if ($avatar !== $oldAvatar) {
            $sets[] = 'avatar = ?';
            $args[] = $avatar;
            $logs[] = array('头像', $oldAvatar !== '' ? '旧头像' : '默认头像', $avatar !== '' ? '已更换' : '已恢复默认');
        }
    }

    if (isset($in['files']) && is_array($in['files'])) {
        $files = staff_files($staff);
        $labels = array('idFront' => '身份证正面照片', 'idBack' => '身份证反面照片', 'photo' => '白底一寸照', 'healthCert' => '健康证');
        $changed = false;
        foreach ($labels as $key => $label) {
            if (!isset($in['files'][$key]) || is_array($in['files'][$key])) continue;
            $raw = trim((string)$in['files'][$key]);
            if ($raw === '') continue;
            $checked = normalize_files(array($key => $raw));
            if ($checked[$key] === '') throw new ApiException('附件地址不合法，请重新上传');
            $st = db()->prepare('SELECT 1 FROM files WHERE file_key = ?');
            $st->execute(array($checked[$key]));
            if (!$st->fetchColumn()) throw new ApiException('附件不存在，请重新上传', 'UPLOAD_MISSING', 400);
            if ($files[$key] !== $checked[$key]) {
                $files[$key] = $checked[$key];
                $changed = true;
                $logs[] = array($label, $staff_files($staff)[$key] !== '' ? '旧附件' : '未上传', '已更换');
            }
        }
        if ($changed) {
            $sets[] = 'files_json = ?';
            $args[] = json_encode($files, JSON_UNESCAPED_UNICODE);
        }
    }

    if (!$sets) return array('ok' => true, 'changed' => 0, 'staff' => staff_out($staff));

    $sets[] = 'updated_at = ?';
    $args[] = now_dt();
    $args[] = $staff['id'];
    $st = db()->prepare('UPDATE staff SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $st->execute($args);

    foreach ($logs as $item) {
        audit_log('自助修改资料', $staff['name'], $item[0] . '：' . ($item[1] === '' ? '(空)' : $item[1]) . ' → ' . ($item[2] === '' ? '(空)' : $item[2]));
    }

    $fresh = staff_by_id($staff['id']);
    return array('ok' => true, 'changed' => count($logs), 'staff' => staff_out($fresh));
}

/* ---------- 站内消息 ---------- */
function message_out($r, $meId)
{
    $fromId = isset($r['from_staff_id']) ? (string)$r['from_staff_id'] : '';
    $toId = isset($r['to_staff_id']) ? (string)$r['to_staff_id'] : '';
    $isMine = $fromId !== '' && $fromId === (string)$meId;
    return array(
        'id' => $r['id'],
        'type' => $r['type'],
        'title' => $r['title'],
        'body' => $r['body'],
        'link' => $r['link'],
        'refId' => $r['ref_id'],
        'fromStaffId' => $fromId,
        'fromName' => isset($r['from_name']) ? $r['from_name'] : '',
        'toStaffId' => $toId,
        'toName' => isset($r['to_name']) ? $r['to_name'] : '',
        'threadId' => isset($r['thread_id']) ? $r['thread_id'] : '',
        'isPrivate' => $r['type'] === 'private',
        'isMine' => $isMine,
        'isSent' => $r['type'] === 'private' && $isMine,
        'direction' => $isMine ? 'out' : 'in',
        'read' => $r['read_at'] !== null && $r['read_at'] !== '',
        'readAt' => $r['read_at'] ? iso($r['read_at']) : '',
        'createdAt' => iso($r['created_at'])
    );
}

function api_message_list($in)
{
    $acc = require_login();
    /* 个人提醒失败重试：打开信箱时顺带补发（内部静默，不影响消息列表） */
    if (function_exists('feishu_webhook_tick')) feishu_webhook_tick();
    try {
        /* scope：all=系统+任务（非私信）/ system / task；默认每页 5 条 */
        $scope = in_str($in, 'scope', 12, 'all');
        if (!in_array($scope, array('all', 'system', 'task'), true)) $scope = 'all';
        $page = (int)in_str($in, 'page', 10);
        if ($page < 1) $page = 1;
        $pageSize = (int)in_str($in, 'pageSize', 10);
        if ($pageSize < 1 || $pageSize > 50) $pageSize = 5;

        $where = "staff_id = ? AND type <> 'private'";
        if ($scope === 'task') $where .= " AND type = 'task'";
        elseif ($scope === 'system') $where .= " AND type <> 'task'";

        $cst = db()->prepare('SELECT COUNT(*) FROM messages WHERE ' . $where);
        $cst->execute(array($acc['staff_id']));
        $total = (int)$cst->fetchColumn();

        $offset = ($page - 1) * $pageSize;
        $st = db()->prepare('SELECT * FROM messages WHERE ' . $where . ' ORDER BY created_at DESC, id DESC LIMIT ' . $pageSize . ' OFFSET ' . $offset);
        $st->execute(array($acc['staff_id']));
        $list = array();
        foreach ($st->fetchAll() as $r) {
            $list[] = message_out($r, $acc['staff_id']);
        }

        /* 未读分类计数（全量，不受分页影响） */
        $unread = array('all' => 0, 'system' => 0, 'task' => 0);
        $ust = db()->prepare("SELECT type, COUNT(*) AS n FROM messages WHERE staff_id = ? AND read_at IS NULL AND type <> 'private' GROUP BY type");
        $ust->execute(array($acc['staff_id']));
        foreach ($ust->fetchAll() as $r) {
            $n = (int)$r['n'];
            $unread['all'] += $n;
            if ($r['type'] === 'task') $unread['task'] += $n;
            else $unread['system'] += $n;
        }

        return array(
            'list' => $list,
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
            'totalPages' => $total > 0 ? (int)ceil($total / $pageSize) : 1,
            'scope' => $scope,
            'unread' => $unread,
            'unreadCount' => $unread['all']
        );
    } catch (Exception $e) {
        /* 旧库未执行迁移时返回空列表，不阻塞页面 */
        return array('list' => array(), 'total' => 0, 'page' => 1, 'pageSize' => 5, 'totalPages' => 1, 'unread' => array('all' => 0, 'system' => 0, 'task' => 0), 'unreadCount' => 0, 'compatible' => false);
    }
}

/**
 * 未读消息数（头像角标 / 标题提示轮询）。
 * 旧库未执行迁移时返回 0，避免阻断页面。
 */
function api_message_unread($in)
{
    $acc = require_login();
    try {
        /* 员工关怀：沿页面访问惰性推进生日通知（同人同年只发一次） */
        if (function_exists('birthday_tick')) birthday_tick();
        /* 效期临期：沿页面访问惰性推送到期前 30 分钟推送（无 cron 时的既有机制） */
        if (function_exists('feishu_webhook_tick')) feishu_webhook_tick();
        $st = db()->prepare('SELECT COUNT(*) FROM messages WHERE staff_id = ? AND read_at IS NULL');
        $st->execute(array($acc['staff_id']));
        return array('unreadCount' => (int)$st->fetchColumn());
    } catch (Exception $e) {
        return array('unreadCount' => 0, 'compatible' => false);
    }
}

/**
 * 主页未读通知弹窗：返回未读条目（不含私信），不修改已读状态
 */
function api_message_unread_list($in)
{
    $acc = require_login();
    try {
        if (function_exists('birthday_tick')) birthday_tick();
        if (function_exists('feishu_webhook_tick')) feishu_webhook_tick();
        $st = db()->prepare("SELECT id, type, title, link, created_at FROM messages WHERE staff_id = ? AND read_at IS NULL AND type <> 'private' ORDER BY created_at DESC LIMIT 50");
        $st->execute(array($acc['staff_id']));
        $list = array();
        foreach ($st->fetchAll() as $r) {
            $list[] = array(
                'id' => (string)$r['id'],
                'type' => (string)$r['type'],
                'title' => (string)$r['title'],
                'link' => (string)$r['link'],
                'createdAt' => iso($r['created_at'])
            );
        }
        return array('unreadCount' => count($list), 'list' => $list);
    } catch (Exception $e) {
        return array('unreadCount' => 0, 'list' => array(), 'compatible' => false);
    }
}

/**
 * 员工间私信：接收方一条未读、发送方一条已读副本，两侧共用 thread_id。
 * 与系统消息同表存储，通过 type='private' 与 from/to 字段区分来源。
 */
function api_message_send($in)
{
    $acc = require_login();
    $from = staff_by_id($acc['staff_id']);
    if (!$from) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $toId = in_str($in, 'toStaffId', 16);
    if ($toId === '') throw new ApiException('请选择接收人');
    if ($toId === (string)$from['id']) throw new ApiException('不能给自己发消息');
    $to = staff_by_id($toId);
    if (!$to || $to['status'] !== 'active') throw new ApiException('接收人不存在或已离职', 'NOT_FOUND', 404);

    $body = isset($in['body']) && is_string($in['body']) ? trim($in['body']) : '';
    $len = function_exists('mb_strlen') ? mb_strlen($body, 'UTF-8') : strlen($body);
    if ($len < 1) throw new ApiException('请输入消息内容');
    if ($len > 500) throw new ApiException('消息内容不能超过 500 字');

    $fromName = str_limit(display_name($from['name'], isset($from['nickname']) ? $from['nickname'] : ''), 40);
    $toName = str_limit(display_name($to['name'], isset($to['nickname']) ? $to['nickname'] : ''), 40);
    $ids = array((string)$from['id'], (string)$to['id']);
    sort($ids, SORT_STRING);
    $threadId = $ids[0] . '_' . $ids[1];

    try {
        $now = now_dt();
        $insert = db()->prepare('INSERT INTO messages (id, staff_id, type, from_staff_id, from_name, to_staff_id, to_name, title, body, link, ref_id, thread_id, read_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $rid = next_message_id();
        $insert->execute(array($rid, $toId, 'private', $from['id'], $fromName, $toId, $toName, '私信 · ' . $fromName, $body, '', '', $threadId, null, $now));
        $sid = next_message_id();
        $insert->execute(array($sid, $from['id'], 'private', $from['id'], $fromName, $toId, $toName, '私信 · 发给 ' . $toName, $body, '', '', $threadId, $now, $now));

        /* 个人提醒：仅推送给接收人；失败静默 */
        if (function_exists('personal_webhook_push')) {
            personal_webhook_push($toId, 'private', '私信 · ' . $fromName, $body, 'messages.html', $rid, $fromName, array('threadId' => $threadId));
        }

        $st = db()->prepare('SELECT * FROM messages WHERE id = ?');
        $st->execute(array($rid));
        $row = $st->fetch();
        return array(
            'ok' => true,
            'threadId' => $threadId,
            'message' => $row ? message_out($row, $from['id']) : null,
            'toName' => $toName
        );
    } catch (Exception $e) {
        throw new ApiException('消息发送失败，请确认已执行数据库迁移', 'MIGRATION_REQUIRED', 500);
    }
}

/**
 * 私信会话列表：同一对方只返回一个会话，按最后一条消息时间倒序。
 */
function api_message_threads($in)
{
    $acc = require_login();
    $me = (string)$acc['staff_id'];
    try {
        $st = db()->prepare("SELECT * FROM messages WHERE staff_id = ? AND type = 'private' ORDER BY created_at DESC, id DESC");
        $st->execute(array($me));
        $threads = array();
        foreach ($st->fetchAll() as $r) {
            $tid = $r['thread_id'] !== '' ? $r['thread_id'] : message_thread_id($r);
            $peerId = (string)$r['from_staff_id'] === $me ? (string)$r['to_staff_id'] : (string)$r['from_staff_id'];
            if (!isset($threads[$tid])) {
                $peer = $peerId !== '' ? staff_by_id($peerId) : null;
                $peerName = $peer ? display_name($peer['name'], isset($peer['nickname']) ? $peer['nickname'] : '') : ($peerId === (string)$r['from_staff_id'] ? $r['from_name'] : $r['to_name']);
                $threads[$tid] = array(
                    'id' => $tid,
                    'peerId' => $peerId,
                    'peerName' => $peerName,
                    'peerNickname' => $peer && isset($peer['nickname']) ? $peer['nickname'] : '',
                    'peerAvatar' => $peer && isset($peer['avatar']) ? $peer['avatar'] : '',
                    'lastText' => $r['body'],
                    'lastAt' => iso($r['created_at']),
                    'lastIsMine' => (string)$r['from_staff_id'] === $me,
                    'unread' => 0
                );
            }
            if ($r['read_at'] === null || $r['read_at'] === '') $threads[$tid]['unread']++;
        }
        $list = array_values($threads);
        usort($list, function ($a, $b) {
            return strcmp($b['lastAt'], $a['lastAt']);
        });
        $unread = 0;
        foreach ($list as $t) $unread += $t['unread'];
        return array('list' => $list, 'unreadCount' => $unread);
    } catch (Exception $e) {
        return array('list' => array(), 'unreadCount' => 0, 'compatible' => false);
    }
}

function message_thread_id($r)
{
    $ids = array((string)$r['from_staff_id'], (string)$r['to_staff_id']);
    sort($ids, SORT_STRING);
    return $ids[0] . '_' . $ids[1];
}

/**
 * 会话消息（时间正序），进入即把该会话未读标记已读。
 */
function api_message_thread($in)
{
    $acc = require_login();
    $me = (string)$acc['staff_id'];
    $threadId = in_str($in, 'threadId', 48);
    $peerId = in_str($in, 'peerId', 16);
    if ($peerId === '' && $threadId !== '') {
        foreach (explode('_', $threadId) as $part) {
            if ($part !== '' && $part !== $me) { $peerId = $part; break; }
        }
    }
    if ($peerId === '') throw new ApiException('会话不存在', 'NOT_FOUND', 404);

    $where = "staff_id = ? AND type = 'private' AND ((from_staff_id = ? AND to_staff_id = ?) OR (from_staff_id = ? AND to_staff_id = ?))";
    try {
        $st = db()->prepare('UPDATE messages SET read_at = ? WHERE ' . $where . ' AND read_at IS NULL');
        $st->execute(array(now_dt(), $me, $me, $peerId, $peerId, $me));

        $st = db()->prepare('SELECT * FROM messages WHERE ' . $where . ' ORDER BY created_at ASC, id ASC LIMIT 500');
        $st->execute(array($me, $me, $peerId, $peerId, $me));
        $rows = $st->fetchAll();
        if (!$rows) throw new ApiException('会话不存在', 'NOT_FOUND', 404);

        $peer = staff_by_id($peerId);
        $peerName = $peer ? display_name($peer['name'], isset($peer['nickname']) ? $peer['nickname'] : '') : '';
        $messages = array();
        $seen = array();
        foreach ($rows as $r) {
            /* 同一内容若同时存在「已发送副本」和「接收副本」，只渲染一次 */
            $dedupeKey = implode('|', array(
                (string)$r['from_staff_id'], (string)$r['to_staff_id'],
                (string)$r['body'], (string)$r['created_at']
            ));
            if (isset($seen[$dedupeKey])) continue;
            $seen[$dedupeKey] = true;
            $item = message_out($r, $me);
            $item['read'] = true;
            $messages[] = $item;
            if ($peerName === '') $peerName = (string)$r['from_staff_id'] === $me ? $r['to_name'] : $r['from_name'];
        }
        return array(
            'thread' => array(
                'id' => $threadId !== '' ? $threadId : message_thread_id($rows[0]),
                'peerId' => $peerId,
                'peerName' => $peerName,
                'peerNickname' => $peer && isset($peer['nickname']) ? $peer['nickname'] : '',
                'peerAvatar' => $peer && isset($peer['avatar']) ? $peer['avatar'] : ''
            ),
            'messages' => $messages
        );
    } catch (ApiException $e) {
        throw $e;
    } catch (Exception $e) {
        throw new ApiException('会话功能尚未启用，请先执行数据库迁移', 'MIGRATION_REQUIRED', 500);
    }
}

function api_message_read($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 32);
    try {
        $st = db()->prepare('UPDATE messages SET read_at = ? WHERE id = ? AND staff_id = ? AND read_at IS NULL');
        $st->execute(array(now_dt(), $id, $acc['staff_id']));
    } catch (Exception $e) {
        throw new ApiException('消息功能尚未启用，请先执行数据库迁移', 'MIGRATION_REQUIRED', 500);
    }
    return array('ok' => true);
}

function api_message_read_all($in)
{
    $acc = require_login();
    try {
        $st = db()->prepare('UPDATE messages SET read_at = ? WHERE staff_id = ? AND read_at IS NULL');
        $st->execute(array(now_dt(), $acc['staff_id']));
        return array('ok' => true, 'changed' => $st->rowCount());
    } catch (Exception $e) {
        throw new ApiException('消息功能尚未启用，请先执行数据库迁移', 'MIGRATION_REQUIRED', 500);
    }
}

function api_account_change_password($in)
{
    $acc = require_login();
    $old = (string)(isset($in['oldPassword']) ? $in['oldPassword'] : '');
    if (!password_verify($old, $acc['password_hash'])) throw new ApiException('原密码不正确');
    $new = (string)(isset($in['newPassword']) ? $in['newPassword'] : '');
    if (!preg_match('/^.{6,20}$/', $new) || !preg_match('/[A-Za-z]/', $new) || !preg_match('/\d/', $new)) {
        throw new ApiException('密码需 6—20 位，且包含字母和数字');
    }
    if ($new !== (string)(isset($in['confirmPassword']) ? $in['confirmPassword'] : '')) {
        throw new ApiException('两次输入的新密码不一致');
    }
    $st = db()->prepare('UPDATE accounts SET password_hash = ?, first_login = 0 WHERE id = ?');
    $st->execute(array(password_hash($new, PASSWORD_DEFAULT), $acc['id']));
    audit_log('修改密码', $acc['name'], '本人修改');
    return array('ok' => true);
}

function api_account_reset_password($in)
{
    $acc = require_login();
    $target = null;
    if (!empty($in['accountId'])) $target = account_by_id((string)$in['accountId']);
    if (!$target && !empty($in['staffId'])) {
        $st = db()->prepare('SELECT * FROM accounts WHERE staff_id = ?');
        $st->execute(array((string)$in['staffId']));
        $target = $st->fetch();
    }
    if (!$target) throw new ApiException('账号不存在', 'NOT_FOUND', 404);
    $isSelf = $target['id'] === $acc['id'];
    if (!$isSelf && $acc['role'] !== 'superadmin') throw new ApiException('该操作仅店长（超级管理员）可执行', 'FORBIDDEN_SUPER', 403);
    $new = (string)(isset($in['password']) ? $in['password'] : '');
    if (!preg_match('/^.{6,20}$/', $new) || !preg_match('/[A-Za-z]/', $new) || !preg_match('/\d/', $new)) {
        throw new ApiException('密码需 6—20 位，且包含字母和数字');
    }
    $st = db()->prepare('UPDATE accounts SET password_hash = ?, first_login = 0 WHERE id = ?');
    $st->execute(array(password_hash($new, PASSWORD_DEFAULT), $target['id']));
    audit_log('重置密码', $target['name'], $isSelf ? '本人修改密码' : '由店长重置');
    return array('ok' => true);
}

function api_accounts_list($in)
{
    require_super();
    $rows = db()->query("SELECT a.*, s.position FROM accounts a LEFT JOIN staff s ON s.id = a.staff_id WHERE a.role IN ('admin','superadmin') ORDER BY a.role DESC, a.name")->fetchAll();
    $out = array();
    foreach ($rows as $r) {
        $item = account_out($r);
        $item['isOwner'] = $r['role'] === 'superadmin';
        $item['position'] = $r['position'] ? normalize_position($r['position']) : '';
        $out[] = $item;
    }
    return $out;
}

function api_accounts_create($in)
{
    $acc = require_super();
    $name = in_str($in, 'name', 40);
    if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z]{2,20}$/u', $name)) {
        throw new ApiException('请输入 2—20 个字的姓名，不要包含数字或符号');
    }
    $phone = trim((string)(isset($in['phone']) ? $in['phone'] : ''));
    if (!preg_match('/^1[3-9]\d{9}$/', $phone)) throw new ApiException('请输入正确的 11 位手机号');
    $password = (string)(isset($in['password']) ? $in['password'] : '');
    if (!preg_match('/^.{6,20}$/', $password) || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        throw new ApiException('密码需 6—20 位，且包含字母和数字');
    }
    $st = db()->prepare('SELECT id FROM accounts WHERE phone = ?');
    $st->execute(array($phone));
    if ($st->fetch()) throw new ApiException('该手机号已注册，请直接登录或联系店长');

    $staffId = next_staff_id();
    $empNo = in_str($in, 'empNo', 24);
    if ($empNo === '') $empNo = next_emp_no();
    $st = db()->prepare('SELECT id FROM staff WHERE emp_no = ?');
    $st->execute(array($empNo));
    if ($st->fetch()) throw new ApiException('工号 ' . $empNo . ' 已被使用');

    $now = now_dt();
    $position = normalize_position(in_str($in, 'position', 20, '店助'));
    db()->beginTransaction();
    try {
        $q = db()->prepare("INSERT INTO staff (id,name,gender,id_card,birth,phone,address,position,employment_type,hire_date,id_card_expiry,health_cert_expiry,emergency,emp_no,status,remark,files_json,created_at,updated_at,submitted_at,reviewed_by,reviewed_at,reject_reason)
            VALUES (?,?,?,NULL,NULL,?,?,?, '全职', ?,NULL,?, '', ?, 'active', ?, '{}', ?,?,?,?,?, '')");
        $q->execute(array(
            $staffId, $name, in_str($in, 'gender', 4, '男'), $phone,
            in_str($in, 'address', 120, '福州市仓山区（管理组账号，资料待补全）'),
            $position, today_d(), date('Y-m-d', strtotime('+365 days')), $empNo,
            '管理组账号，由店长创建', $now, $now, $now, $acc['name'], $now
        ));
        $accId = next_account_id($staffId);
        $q = db()->prepare('INSERT INTO accounts (id, phone, name, role, staff_id, status, password_hash, first_login, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,1,?,NULL)');
        $q->execute(array($accId, $phone, $name, 'admin', $staffId, 'active', password_hash($password, PASSWORD_DEFAULT), $now));
        db()->commit();
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }
    audit_log('新增管理组账号', $name, '手机号 ' . $phone);
    return array('ok' => true, 'staffId' => $staffId);
}

function api_accounts_toggle($in)
{
    $acc = require_super();
    $target = account_by_id(isset($in['accountId']) ? (string)$in['accountId'] : '');
    if (!$target) throw new ApiException('账号不存在', 'NOT_FOUND', 404);
    if ($target['role'] === 'superadmin') throw new ApiException('店长本人账号不可停用');
    if ($target['id'] === $acc['id']) throw new ApiException('不能停用自己的账号');
    $status = $target['status'] === 'active' ? 'disabled' : 'active';
    $st = db()->prepare('UPDATE accounts SET status = ? WHERE id = ?');
    $st->execute(array($status, $target['id']));
    audit_log($status === 'active' ? '启用账号' : '停用账号', $target['name'], $target['phone']);
    return array('status' => $status);
}

function api_audit_log_add($in)
{
    require_login();
    $action = in_str($in, 'action', 80);
    if ($action === '') return array('ok' => true);
    audit_log($action, in_str($in, 'target', 80, '—'), in_str($in, 'detail', 255));
    return array('ok' => true);
}

function api_audit_list($in)
{
    require_admin();
    $where = array();
    $args = array();
    $operator = in_str($in, 'operator', 40);
    if ($operator !== '') {
        $where[] = 'operator LIKE ?';
        $args[] = '%' . $operator . '%';
    }
    $from = in_str($in, 'from', 10);
    if ($from !== '') {
        $where[] = 'time >= ?';
        $args[] = $from . ' 00:00:00';
    }
    $to = in_str($in, 'to', 10);
    if ($to !== '') {
        $where[] = 'time <= ?';
        $args[] = $to . ' 23:59:59';
    }
    $sql = 'SELECT * FROM audit_logs' . ($where ? (' WHERE ' . implode(' AND ', $where)) : '') . ' ORDER BY time DESC, id DESC LIMIT 500';
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    $list = array();
    foreach ($rows as $r) {
        $list[] = array(
            'id' => 'LOG' . $r['id'],
            'time' => iso($r['time']),
            'operator' => $r['operator'],
            'role' => $r['role'],
            'target' => $r['target'],
            'action' => $r['action'],
            'detail' => $r['detail']
        );
    }
    return array('list' => $list, 'total' => count($list));
}
