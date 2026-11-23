<?php
/* staff_actions.php — 员工档案、审核、离职与更正申请 */

function mask_phone($p)
{
    $s = (string)$p;
    if (strlen($s) < 8) return $s === '' ? '—' : $s;
    return substr($s, 0, 3) . '****' . substr($s, -4);
}

function api_staff_list($in)
{
    require_admin();
    $status = in_str($in, 'status', 16, 'all');
    $position = in_str($in, 'position', 20, 'all');
    $keyword = in_str($in, 'keyword', 40);
    $includeResigned = in_bool($in, 'includeResigned');
    $page = max(1, in_int($in, 'page', 1));
    $size = in_int($in, 'pageSize', 20);
    if ($size < 1) $size = 20;
    if ($size > 9999) $size = 9999;

    $where = array();
    $args = array();
    if ($status !== '' && $status !== 'all') {
        $where[] = 'status = ?';
        $args[] = $status;
    } elseif (!$includeResigned && $status !== 'resigned') {
        $where[] = "status <> 'resigned'";
    }
    if ($position !== '' && $position !== 'all') {
        $where[] = 'position = ?';
        $args[] = $position;
    }
    if ($keyword !== '') {
        $where[] = '(name LIKE ? OR phone LIKE ? OR emp_no LIKE ? OR feishu_emp_no LIKE ?)';
        $args[] = '%' . $keyword . '%';
        $args[] = '%' . $keyword . '%';
        $args[] = '%' . $keyword . '%';
        $args[] = '%' . $keyword . '%';
    }
    $sqlWhere = $where ? (' WHERE ' . implode(' AND ', $where)) : '';

    $st = db()->prepare('SELECT COUNT(*) FROM staff' . $sqlWhere);
    $st->execute($args);
    $total = (int)$st->fetchColumn();

    $sql = "SELECT * FROM staff" . $sqlWhere . " ORDER BY FIELD(status,'pending','rejected','active','resigned','disabled'), emp_no IS NULL, emp_no, created_at DESC LIMIT " . (int)$size . ' OFFSET ' . (int)(($page - 1) * $size);
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();

    $list = array();
    foreach ($rows as $s) {
        $files = staff_files($s);
        $list[] = array(
            'id' => $s['id'],
            'name' => $s['name'],
            'nickname' => isset($s['nickname']) ? $s['nickname'] : '',
            'avatar' => isset($s['avatar']) ? $s['avatar'] : '',
            'displayName' => display_name($s['name'], isset($s['nickname']) ? $s['nickname'] : ''),
            'empNo' => $s['emp_no'] ? $s['emp_no'] : '—',
            'feishuEmpNo' => isset($s['feishu_emp_no']) ? $s['feishu_emp_no'] : '',
            'position' => normalize_position($s['position']),
            'phone' => $s['phone'],
            'maskedPhone' => mask_phone($s['phone']),
            'hireDate' => $s['hire_date'] ? $s['hire_date'] : '',
            'status' => $s['status'],
            'photo' => $files['photo'],
            'healthCertExpiry' => $s['health_cert_expiry'] ? $s['health_cert_expiry'] : '',
            'expiry' => expiry_info($s),
            'employmentType' => $s['employment_type'],
            'submittedAt' => iso($s['submitted_at'] ? $s['submitted_at'] : $s['created_at']),
            'createdAt' => iso($s['created_at']),
            'gender' => $s['gender']
        );
    }
    return array('list' => $list, 'total' => $total, 'page' => $page, 'pageSize' => $size);
}

function api_staff_get($in)
{
    require_admin();
    $staff = staff_by_id(isset($in['id']) ? (string)$in['id'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    return staff_out($staff);
}

/* 他人主页 / 用户资料：普通员工仅公开信息，超管可见敏感字段 */
function api_staff_profile($in)
{
    $acc = require_login();
    $staff = staff_by_id(isset($in['id']) ? (string)$in['id'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $isSuper = $acc['role'] === 'superadmin';
    $isSelf = $staff['id'] === $acc['staff_id'];
    if (!$isSelf && !$isSuper && $staff['status'] !== 'active') {
        throw new ApiException('档案不可查看', 'FORBIDDEN', 403);
    }

    $month = month_of(today_d());
    $files = staff_files($staff);
    $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
    $info = expiry_info($staff);
    $latest = hcv_latest($staff['id'], $certKey);

    $health = array(
        'expiry' => $staff['health_cert_expiry'] ? $staff['health_cert_expiry'] : '',
        'days' => $info['health']['days'],
        'state' => $info['health']['state'],
        'certKey' => $isSuper ? $certKey : '',
        'verify' => $latest ? array(
            'result' => $latest['result'],
            'verifiedAt' => iso($latest['verified_at'])
        ) : null,
        'material' => ($isSuper && $latest) ? hcv_material_out($latest) : null,
        'remark' => ($isSuper && $latest) ? $latest['remark'] : '',
        'verifiedByName' => ($isSuper && $latest) ? $latest['verified_name'] : ''
    );

    $stats = leave_stats($staff['id'], $month);
    $leaveList = array();
    foreach ($stats['list'] as $l) {
        if ($l['status'] === 'approved' || $l['status'] === 'pending') $leaveList[] = $l;
    }

    $scoreRow = score_row($staff['id'], $month);
    $score = null;
    if ($scoreRow && ($isSuper || $scoreRow['status'] === 'published')) {
        $score = array(
            'month' => $scoreRow['month'],
            'total' => (float)$scoreRow['total'],
            'grade' => $scoreRow['grade'],
            'status' => $scoreRow['status'],
            'publishAt' => iso($scoreRow['publish_at'])
        );
        if ($isSuper) {
            $score['dims'] = json_field($scoreRow['dims_json'], array());
            $score['adjust'] = json_field($scoreRow['adjust_json'], array());
        }
    }

    $out = array(
        'id' => $staff['id'],
        'name' => $staff['name'],
        'nickname' => isset($staff['nickname']) ? $staff['nickname'] : '',
        'displayName' => display_name($staff['name'], isset($staff['nickname']) ? $staff['nickname'] : ''),
        'avatar' => isset($staff['avatar']) ? $staff['avatar'] : '',
        'position' => normalize_position($staff['position']),
        'employmentType' => $staff['employment_type'],
        'empNo' => $staff['emp_no'] ? $staff['emp_no'] : '',
        'feishuEmpNo' => isset($staff['feishu_emp_no']) ? $staff['feishu_emp_no'] : '',
        'status' => $staff['status'],
        'phone' => $staff['phone'],
        'hireDate' => $staff['hire_date'] ? $staff['hire_date'] : '',
        'isSelf' => $isSelf,
        'isSuper' => $isSuper,
        'canEdit' => $isSuper && !$isSelf,
        'canScore' => $isSuper && !$isSelf,
        'health' => $health,
        'leaves' => array(
            'month' => $month,
            'used' => $stats['used'],
            'pending' => $stats['pending'],
            'list' => $leaveList
        ),
        'score' => $score
    );
    if ($isSuper) {
        $out['idCard'] = $staff['id_card'] ? $staff['id_card'] : '';
        $out['address'] = $staff['address'];
        $out['emergency'] = $staff['emergency'];
        $out['files'] = $files;
        $out['feishuId'] = isset($staff['feishu_id']) ? $staff['feishu_id'] : '';
        $out['idCardExpiry'] = $staff['id_card_expiry'] ? $staff['id_card_expiry'] : '';
        $out['healthCertExpiry'] = $staff['health_cert_expiry'] ? $staff['health_cert_expiry'] : '';
        $out['remark'] = $staff['remark'];
    }
    return $out;
}

function api_staff_review($in)
{
    $acc = require_admin();
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    if ($staff['status'] !== 'pending' && $staff['status'] !== 'rejected') throw new ApiException('该档案当前状态不可审核');
    $action = in_str($in, 'action', 12);
    $payload = isset($in['payload']) && is_array($in['payload']) ? $in['payload'] : array();

    if ($action === 'approve') {
        $empNo = in_str($payload, 'empNo', 24);
        if ($empNo === '') throw new ApiException('请填写门店工号');
        $st = db()->prepare('SELECT name FROM staff WHERE emp_no = ? AND id <> ?');
        $st->execute(array($empNo, $staff['id']));
        $dup = $st->fetch();
        if ($dup) throw new ApiException('工号 ' . $empNo . ' 已被 ' . $dup['name'] . ' 使用');
        $hireDate = in_str($payload, 'hireDate', 10, $staff['hire_date']);
        if (!$hireDate) throw new ApiException('请选择入职日期');
        $hd = diff_days($hireDate, today_d());
        if (diff_days($hireDate, '2010-01-01') < 0 || $hd > 30) throw new ApiException('入职日期超出可填写范围，请核对');
        $position = normalize_position(in_str($payload, 'position', 20, $staff['position']));
        $employment = in_str($payload, 'employmentType', 10, $staff['employment_type']);
        $st = db()->prepare("UPDATE staff SET emp_no=?, position=?, employment_type=?, hire_date=?, status='active', reviewed_by=?, reviewed_at=?, reject_reason='', updated_at=? WHERE id=?");
        $st->execute(array($empNo, $position, $employment, $hireDate, $acc['name'], now_dt(), now_dt(), $staff['id']));
        audit_log('审核通过', $staff['name'], '工号 ' . $empNo . '，岗位 ' . $position);
        return array('status' => 'active');
    }

    $reason = in_str($payload, 'reason', 255);
    if (function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') < 5 : strlen($reason) < 5) {
        throw new ApiException('请填写至少 5 个字的驳回原因，便于员工修改');
    }
    $st = db()->prepare("UPDATE staff SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
    $st->execute(array($reason, $acc['name'], now_dt(), now_dt(), $staff['id']));
    audit_log('审核驳回', $staff['name'], '原因：' . $reason);
    return array('status' => 'rejected');
}

function api_staff_resign($in)
{
    $acc = require_admin();
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $date = in_str($in, 'resignDate', 10);
    if (!$date) throw new ApiException('请选择离职日期');
    $reason = in_str($in, 'reason', 255);
    $handover = in_str($in, 'handover', 255);
    $st = db()->prepare("UPDATE staff SET status='resigned', resign_date=?, resign_reason=?, handover=?, updated_at=? WHERE id=?");
    $st->execute(array($date, $reason, $handover, now_dt(), $staff['id']));
    $st = db()->prepare("UPDATE accounts SET status='disabled' WHERE staff_id=?");
    $st->execute(array($staff['id']));
    audit_log('标记离职', $staff['name'], '离职日期 ' . $date . ($reason !== '' ? '，原因：' . $reason : ''));
    return array('status' => 'resigned');
}

function api_staff_reactivate($in)
{
    $acc = require_admin();
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $st = db()->prepare("UPDATE staff SET status='active', updated_at=? WHERE id=?");
    $st->execute(array(now_dt(), $staff['id']));
    $st = db()->prepare("UPDATE accounts SET status='active' WHERE staff_id=?");
    $st->execute(array($staff['id']));
    audit_log('恢复在职', $staff['name'], '由 ' . $acc['name'] . ' 恢复');
    return array('status' => 'active');
}

function api_staff_remark($in)
{
    require_admin();
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $remark = in_str($in, 'remark', 200);
    $st = db()->prepare('UPDATE staff SET remark=?, updated_at=? WHERE id=?');
    $st->execute(array($remark, now_dt(), $staff['id']));
    audit_log('修改备注', $staff['name'], $remark);
    return array('ok' => true);
}

function api_staff_update($in)
{
    $acc = require_admin();
    /* 超级管理员可修改全部信息与证件，其余管理组仅可改岗位等基础字段 */
    $isSuper = isset($acc['role']) && $acc['role'] === 'superadmin';
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $patch = isset($in['patch']) && is_array($in['patch']) ? $in['patch'] : array();
    $sets = array();
    $args = array();
    $log = array();
    $newName = null;
    $newPhone = null;

    $map = array('position' => 'position', 'employmentType' => 'employment_type', 'hireDate' => 'hire_date', 'emergency' => 'emergency');
    foreach ($map as $js => $col) {
        if (isset($patch[$js]) && $patch[$js] !== '') {
            if ($js === 'hireDate') {
                $hd = diff_days((string)$patch[$js], today_d());
                if ($hd > 30) throw new ApiException('入职日期超出可填写范围，请核对');
            }
            $sets[] = $col . ' = ?';
            $args[] = $js === 'position' ? normalize_position(in_str($patch, $js, 120)) : in_str($patch, $js, 120);
            $log[] = $js . '=' . $patch[$js];
        }
    }
    if (array_key_exists('remark', $patch)) {
        $sets[] = 'remark = ?';
        $args[] = in_str($patch, 'remark', 200);
        if (!$log) $log[] = '更新备注';
    }

    if ($isSuper) {
        if (isset($patch['name']) && trim((string)$patch['name']) !== '' && trim((string)$patch['name']) !== $staff['name']) {
            $name = trim((string)$patch['name']);
            if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z·]{2,20}$/u', $name)) throw new ApiException('姓名需为 2—20 个中文或字母');
            $sets[] = 'name = ?';
            $args[] = $name;
            $log[] = '姓名：' . $staff['name'] . ' → ' . $name;
            $newName = $name;
        }
        if (isset($patch['phone']) && trim((string)$patch['phone']) !== '' && trim((string)$patch['phone']) !== $staff['phone']) {
            $phone = trim((string)$patch['phone']);
            if (!preg_match('/^1[3-9]\d{9}$/', $phone)) throw new ApiException('手机号格式不正确');
            $q = db()->prepare('SELECT id FROM accounts WHERE phone = ? AND staff_id <> ?');
            $q->execute(array($phone, $staff['id']));
            if ($q->fetch()) throw new ApiException('该手机号已被其他账号使用');
            $sets[] = 'phone = ?';
            $args[] = $phone;
            $log[] = '手机号：' . mask_phone($staff['phone']) . ' → ' . mask_phone($phone);
            $newPhone = $phone;
        }
        if (isset($patch['idCard']) && trim((string)$patch['idCard']) !== '' && strtoupper(trim((string)$patch['idCard'])) !== strtoupper((string)$staff['id_card'])) {
            $idc = strtoupper(trim((string)$patch['idCard']));
            if (!preg_match('/^\d{17}[\dX]$/', $idc)) throw new ApiException('身份证号格式不正确');
            $q = db()->prepare('SELECT id FROM staff WHERE id_card = ? AND id <> ?');
            $q->execute(array($idc, $staff['id']));
            if ($q->fetch()) throw new ApiException('该身份证号已被其他档案使用');
            $sets[] = 'id_card = ?';
            $args[] = $idc;
            $sets[] = 'birth = ?';
            $args[] = substr($idc, 6, 4) . '-' . substr($idc, 10, 2) . '-' . substr($idc, 12, 2);
            $sets[] = 'gender = ?';
            $args[] = ((int)$idc[16] % 2 === 1) ? '男' : '女';
            $log[] = '身份证号：' . (strlen($idc) >= 10 ? substr($idc, 0, 6) . '********' . substr($idc, -4) : '已更新');
        }
        if (array_key_exists('address', $patch) && trim((string)$patch['address']) !== (string)$staff['address']) {
            $sets[] = 'address = ?';
            $args[] = in_str($patch, 'address', 200);
            $log[] = '更新居住地址';
        }
        if (array_key_exists('feishuId', $patch)) {
            $fid = trim((string)$patch['feishuId']);
            if ($fid !== '' && !preg_match('/^[A-Za-z0-9_:.\-]{1,64}$/', $fid)) {
                throw new ApiException('飞书 ID 仅支持字母、数字及 _ : . - ，最长 64 位');
            }
            $sets[] = 'feishu_id = ?';
            $args[] = $fid;
            $log[] = '飞书 ID：' . ($fid === '' ? '已清空' : $fid);
        }
        if (array_key_exists('empNo', $patch)) {
            $eno = trim((string)$patch['empNo']);
            if ($eno !== '' && !preg_match('/^[A-Za-z0-9_:.\-]{2,32}$/', $eno)) {
                throw new ApiException('门店工号仅支持字母、数字及 _ : . - ，2—32 位');
            }
            if ($eno !== '') {
                $q = db()->prepare('SELECT id FROM staff WHERE id <> ? AND (emp_no = ? OR feishu_emp_no = ?)');
                $q->execute(array($staff['id'], $eno, $eno));
                if ($q->fetch()) throw new ApiException('该工号已被其他员工使用（门店工号与飞书工号不可重复）');
            }
            $sets[] = 'emp_no = ?';
            $args[] = $eno;
            $log[] = '门店工号：' . ($eno === '' ? '已清空' : $eno);
        }
        if (array_key_exists('feishuEmpNo', $patch)) {
            $fno = trim((string)$patch['feishuEmpNo']);
            if ($fno !== '' && !preg_match('/^[A-Za-z0-9_:.\-]{1,64}$/', $fno)) {
                throw new ApiException('飞书工号仅支持字母、数字及 _ : . - ，最长 64 位');
            }
            if ($fno !== '') {
                $q = db()->prepare('SELECT id FROM staff WHERE id <> ? AND (emp_no = ? OR feishu_emp_no = ?)');
                $q->execute(array($staff['id'], $fno, $fno));
                if ($q->fetch()) throw new ApiException('该工号已被其他员工使用（门店工号与飞书工号不可重复）');
            }
            $sets[] = 'feishu_emp_no = ?';
            $args[] = $fno;
            $log[] = '飞书工号：' . ($fno === '' ? '已清空' : $fno);
        }
        if (isset($patch['idCardExpiry']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$patch['idCardExpiry'])) {
            $sets[] = 'id_card_expiry = ?';
            $args[] = (string)$patch['idCardExpiry'];
            $log[] = '身份证有效期=' . $patch['idCardExpiry'];
        }
        if (isset($patch['healthCertExpiry']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$patch['healthCertExpiry'])) {
            $sets[] = 'health_cert_expiry = ?';
            $args[] = (string)$patch['healthCertExpiry'];
            $log[] = '健康证有效期=' . $patch['healthCertExpiry'];
        }
        if (isset($patch['files']) && is_array($patch['files'])) {
            $checked = normalize_files($patch['files']);
            $files = staff_files($staff);
            $fileChanged = false;
            foreach ($checked as $k => $v) {
                if ($v === '') continue;
                $q = db()->prepare('SELECT 1 FROM files WHERE file_key = ?');
                $q->execute(array($v));
                if (!$q->fetchColumn()) throw new ApiException('附件不存在，请重新上传');
                $files[$k] = $v;
                $fileChanged = true;
                $log[] = '更新证件：' . $k;
            }
            if ($fileChanged) {
                $sets[] = 'files_json = ?';
                $args[] = json_encode($files, JSON_UNESCAPED_UNICODE);
            }
        }
    }

    if (!$sets) return array('ok' => true);
    $sets[] = 'updated_at = ?';
    $args[] = now_dt();
    $args[] = $staff['id'];
    $st = db()->prepare('UPDATE staff SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $st->execute($args);
    if ($newName !== null) {
        $q = db()->prepare('UPDATE accounts SET name = ? WHERE staff_id = ?');
        $q->execute(array($newName, $staff['id']));
    }
    if ($newPhone !== null) {
        $q = db()->prepare('UPDATE accounts SET phone = ? WHERE staff_id = ?');
        $q->execute(array($newPhone, $staff['id']));
    }
    audit_log($isSuper ? '超级管理员修改档案' : '修改档案信息', $newName !== null ? $newName : $staff['name'], implode('，', $log));
    return array('ok' => true);
}

/* 门店通讯录：全体在职员工可查看 */
function api_staff_contacts($in)
{
    require_login();
    $rows = db()->query("SELECT id, name, nickname, avatar, position, phone, emp_no, feishu_emp_no, employment_type FROM staff WHERE status = 'active' ORDER BY FIELD(position, '店长', '店助', '值班经理', '店员'), name")->fetchAll();
    $list = array();
    foreach ($rows as $r) {
        $list[] = array(
            'id' => $r['id'],
            'name' => $r['name'],
            'nickname' => isset($r['nickname']) ? $r['nickname'] : '',
            'displayName' => display_name($r['name'], isset($r['nickname']) ? $r['nickname'] : ''),
            'avatar' => isset($r['avatar']) ? $r['avatar'] : '',
            'position' => normalize_position($r['position']),
            'phone' => $r['phone'],
            'empNo' => $r['emp_no'] ? $r['emp_no'] : '',
            'feishuEmpNo' => isset($r['feishu_emp_no']) ? $r['feishu_emp_no'] : '',
            'employmentType' => $r['employment_type']
        );
    }
    return array('list' => $list, 'store' => store_info());
}

/* 本月生日员工（全员可见的生日关怀） */
function api_staff_birthdays($in)
{
    require_login();
    $st = db()->prepare("SELECT id, name, nickname, birth FROM staff WHERE status = 'active' AND birth IS NOT NULL AND birth <> '0000-00-00' AND MONTH(birth) = ? ORDER BY DAY(birth)");
    $st->execute(array((int)date('n')));
    $list = array();
    foreach ($st->fetchAll() as $r) {
        $list[] = array(
            'id' => $r['id'],
            'name' => $r['name'],
            'displayName' => display_name($r['name'], isset($r['nickname']) ? $r['nickname'] : ''),
            'birthday' => $r['birth'],
            'day' => (int)date('j', strtotime($r['birth']))
        );
    }
    return array('month' => (int)date('n'), 'list' => $list);
}

function api_corrections_list($in)
{
    require_admin();
    $where = array();
    $args = array();
    $staffId = in_str($in, 'staffId', 16);
    if ($staffId !== '') {
        $where[] = 'c.staff_id = ?';
        $args[] = $staffId;
    }
    $status = in_str($in, 'status', 16);
    if ($status !== '' && $status !== 'all') {
        $where[] = 'c.status = ?';
        $args[] = $status;
    }
    $sql = 'SELECT c.*, s.name AS staff_name, s.position AS staff_position FROM corrections c LEFT JOIN staff s ON s.id = c.staff_id' .
        ($where ? (' WHERE ' . implode(' AND ', $where)) : '') . ' ORDER BY c.created_at DESC';
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = $st->fetchAll();
    $list = array();
    foreach ($rows as $c) {
        $list[] = array(
            'id' => $c['id'],
            'staffId' => $c['staff_id'],
            'field' => $c['field'],
            'fieldLabel' => $c['field_label'],
            'oldValue' => $c['old_value'],
            'newValue' => $c['new_value'],
            'note' => $c['note'],
            'status' => $c['status'],
            'createdAt' => iso($c['created_at']),
            'reviewedBy' => $c['reviewed_by'],
            'reviewedAt' => iso($c['reviewed_at']),
            'rejectReason' => $c['reject_reason'],
            'staffName' => $c['staff_name'] ? $c['staff_name'] : '',
            'position' => $c['staff_position'] ? normalize_position($c['staff_position']) : '',
            'superOnly' => in_array($c['field'], array('phone', 'address', 'idFront', 'idBack', 'photo', 'healthCert'), true)
        );
    }
    return array('list' => $list, 'total' => count($list));
}

function api_corrections_resolve($in)
{
    $acc = require_admin();
    $st = db()->prepare('SELECT * FROM corrections WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $c = $st->fetch();
    if (!$c) throw new ApiException('更正申请不存在', 'NOT_FOUND', 404);
    $staff = staff_by_id($c['staff_id']);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $superOnly = in_array($c['field'], array('phone', 'address', 'idFront', 'idBack', 'photo', 'healthCert'), true);
    if ($superOnly && $acc['role'] !== 'superadmin') {
        throw new ApiException('手机号、住址与证件附件更正仅店长可审核');
    }
    $action = in_str($in, 'action', 12);
    if ($action === 'accept') {
        $allowed = array('name', 'phone', 'address', 'emergency', 'position', 'healthCertExpiry', 'healthCert', 'idFront', 'idBack', 'photo');
        if (!in_array($c['field'], $allowed, true)) {
            throw new ApiException('该字段需本人到店办理，请引导员工联系店长');
        }
        $col = null;
        $value = $c['new_value'];
        if ($c['field'] === 'name') {
            if (!preg_match('/^[\x{4e00}-\x{9fa5}A-Za-z]{2,20}$/u', $value)) throw new ApiException('申请中的姓名格式不正确，请驳回后让员工重新提交');
            $q = db()->prepare('UPDATE staff SET name = ?, updated_at = ? WHERE id = ?');
            $q->execute(array($value, now_dt(), $staff['id']));
            $q = db()->prepare('UPDATE accounts SET name = ? WHERE staff_id = ?');
            $q->execute(array($value, $staff['id']));
        } elseif ($c['field'] === 'position') {
            $value = normalize_position($value);
            $col = 'position';
        } elseif ($c['field'] === 'phone') {
            if (!preg_match('/^1[3-9]\d{9}$/', $c['new_value'])) throw new ApiException('申请中的手机号格式不正确，请驳回后让员工重新提交');
            $st = db()->prepare('SELECT id FROM accounts WHERE phone = ? AND staff_id <> ?');
            $st->execute(array($c['new_value'], $staff['id']));
            if ($st->fetch()) throw new ApiException('该手机号已被其他账号使用');
            $q = db()->prepare('UPDATE accounts SET phone = ? WHERE staff_id = ?');
            $q->execute(array($c['new_value'], $staff['id']));
            $q = db()->prepare('UPDATE staff SET phone = ?, updated_at = ? WHERE id = ?');
            $q->execute(array($c['new_value'], now_dt(), $staff['id']));
            $col = null;
        } elseif ($c['field'] === 'healthCertExpiry') {
            if (diff_days($c['new_value'], today_d()) < 0) throw new ApiException('健康证有效期已过期，无法采纳');
            $col = 'health_cert_expiry';
        } elseif (in_array($c['field'], array('idFront', 'idBack', 'photo', 'healthCert'), true)) {
            $checked = normalize_files(array($c['field'] => $c['new_value']));
            $key = $checked[$c['field']];
            $okExt = $c['field'] === 'healthCert' ? '/\.(pdf|jpe?g|png|webp)$/i' : '/\.(jpe?g|png|webp)$/i';
            if ($key === '' || !preg_match($okExt, $key)) throw new ApiException('申请中的附件不合法，请驳回后让员工重新提交');
            $st = db()->prepare('SELECT 1 FROM files WHERE file_key = ?');
            $st->execute(array($key));
            if (!$st->fetchColumn()) throw new ApiException('申请中的附件已不存在，请驳回后让员工重新上传');
            $files = staff_files($staff);
            $files[$c['field']] = $key;
            $q = db()->prepare('UPDATE staff SET files_json = ?, updated_at = ? WHERE id = ?');
            $q->execute(array(json_encode($files, JSON_UNESCAPED_UNICODE), now_dt(), $staff['id']));
            $col = null;
        } elseif ($c['field'] === 'address') {
            $col = 'address';
        } else {
            $col = 'emergency';
        }
        if ($col !== null) {
            $q = db()->prepare('UPDATE staff SET ' . $col . ' = ?, updated_at = ? WHERE id = ?');
            $q->execute(array($value, now_dt(), $staff['id']));
        }
        $q = db()->prepare("UPDATE corrections SET status='accepted', reviewed_by=?, reviewed_at=? WHERE id=?");
        $q->execute(array($acc['name'], now_dt(), $c['id']));
        audit_log('处理更正申请', $staff['name'], '已采纳：' . $c['field_label']);
        return array('status' => 'accepted');
    }
    $reason = in_str($in, 'reason', 255);
    $q = db()->prepare("UPDATE corrections SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=? WHERE id=?");
    $q->execute(array($reason, $acc['name'], now_dt(), $c['id']));
    audit_log('处理更正申请', $staff['name'], '已驳回：' . $c['field_label']);
    return array('status' => 'rejected');
}
