<?php
/* health_verify_actions.php — 健康证核验（仅超级管理员/店长） */

function hcv_material_out($row)
{
    if (empty($row['material_key'])) return null;
    $mime = '';
    $st = db()->prepare('SELECT mime FROM files WHERE file_key = ?');
    $st->execute(array($row['material_key']));
    $f = $st->fetch();
    if ($f) $mime = (string)$f['mime'];
    return array(
        'key' => $row['material_key'],
        'name' => $row['material_name'] !== '' ? $row['material_name'] : '核验材料',
        'type' => $mime
    );
}

function hcv_out($row)
{
    return array(
        'id' => $row['id'],
        'staffId' => $row['staff_id'],
        'certKey' => $row['cert_key'],
        'result' => $row['result'],
        'remark' => $row['remark'],
        'material' => hcv_material_out($row),
        'verifiedBy' => $row['verified_by'],
        'verifiedByName' => $row['verified_name'],
        'verifiedAt' => iso($row['verified_at'])
    );
}

/**
 * 员工针对「当前健康证」的最近一次核验。
 * cert_key 与当前证件不一致（换了新证件）或证件为空时返回 null，状态回到未核验。
 */
function hcv_latest($staffId, $certKey)
{
    if ($certKey === '') return null;
    $st = db()->prepare('SELECT * FROM health_cert_verifications WHERE staff_id = ? AND cert_key = ? ORDER BY verified_at DESC, created_at DESC, id DESC LIMIT 1');
    $st->execute(array($staffId, $certKey));
    $r = $st->fetch();
    return $r ? $r : null;
}

function api_health_verify_list($in)
{
    require_super();
    $cfg = settings_data();
    $threshold = (int)$cfg['expiry']['healthCert'];
    $today = today_d();

    $st = db()->query("SELECT s.id, s.name, s.position, s.employment_type, s.emp_no, s.feishu_emp_no, s.avatar, s.health_cert_expiry, s.files_json
        FROM staff s
        WHERE s.status = 'active'
          AND s.id NOT IN (SELECT staff_id FROM accounts WHERE role = 'superadmin')
        ORDER BY s.name");
    $list = array();
    $counts = array('pass' => 0, 'reject' => 0, 'none' => 0);
    $uploaded = 0;
    foreach ($st->fetchAll() as $r) {
        $files = json_field($r['files_json'], array());
        $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
        $isPdf = $certKey !== '' && strtolower(pathinfo($certKey, PATHINFO_EXTENSION)) === 'pdf';
        if ($certKey !== '') $uploaded++;
        $days = $r['health_cert_expiry'] ? diff_days($r['health_cert_expiry'], $today) : null;
        $expiryState = $days === null ? 'none' : ($days < 0 ? 'expired' : ($days <= $threshold ? 'soon' : 'valid'));

        $latest = hcv_latest($r['id'], $certKey);
        $status = $latest ? $latest['result'] : 'none';
        $counts[$status]++;

        $item = array(
            'staffId' => $r['id'],
            'name' => $r['name'],
            'position' => normalize_position($r['position']),
            'employmentType' => $r['employment_type'],
            'empNo' => $r['emp_no'] ? $r['emp_no'] : '',
            'feishuEmpNo' => isset($r['feishu_emp_no']) ? $r['feishu_emp_no'] : '',
            'avatar' => $r['avatar'] ? $r['avatar'] : '',
            'certKey' => $certKey,
            'hasCert' => $certKey !== '',
            'certIsPdf' => $isPdf,
            'expiry' => $r['health_cert_expiry'] ? $r['health_cert_expiry'] : '',
            'expiryState' => $expiryState,
            'days' => $days,
            'verifyStatus' => $status,
            'verifiedAt' => $latest ? iso($latest['verified_at']) : '',
            'verifiedByName' => $latest ? $latest['verified_name'] : '',
            'remark' => $latest ? $latest['remark'] : '',
            'material' => $latest ? hcv_material_out($latest) : null
        );
        $list[] = $item;
    }

    usort($list, function ($a, $b) {
        $rank = array('none' => 0, 'reject' => 1, 'pass' => 2);
        if ($rank[$a['verifyStatus']] !== $rank[$b['verifyStatus']]) {
            return $rank[$a['verifyStatus']] - $rank[$b['verifyStatus']];
        }
        return strcmp($a['name'], $b['name']);
    });

    return array(
        'list' => $list,
        'counts' => array(
            'pass' => $counts['pass'], 'reject' => $counts['reject'], 'none' => $counts['none'],
            'total' => count($list), 'uploaded' => $uploaded, 'unuploaded' => count($list) - $uploaded
        )
    );
}

function api_health_verify_history($in)
{
    require_super();
    $sid = isset($in['staffId']) ? (string)$in['staffId'] : '';
    $staff = staff_by_id($sid);
    if (!$staff) throw new ApiException('员工不存在', 'NOT_FOUND', 404);
    $files = json_field($staff['files_json'], array());
    $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';

    $st = db()->prepare('SELECT * FROM health_cert_verifications WHERE staff_id = ? ORDER BY verified_at DESC, created_at DESC, id DESC');
    $st->execute(array($sid));
    $rows = array();
    foreach ($st->fetchAll() as $r) {
        $item = hcv_out($r);
        $item['current'] = ($certKey !== '' && $r['cert_key'] === $certKey);
        $rows[] = $item;
    }
    return array(
        'staff' => array('id' => $staff['id'], 'name' => $staff['name'], 'certKey' => $certKey),
        'list' => $rows
    );
}

function api_health_verify_save($in)
{
    $acc = require_super();
    $sid = isset($in['staffId']) ? (string)$in['staffId'] : '';
    $staff = staff_by_id($sid);
    if (!$staff) throw new ApiException('员工不存在', 'NOT_FOUND', 404);
    if ($staff['status'] !== 'active') throw new ApiException('仅在职员工可核验');

    $files = json_field($staff['files_json'], array());
    $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
    if ($certKey === '' || strtolower(pathinfo($certKey, PATHINFO_EXTENSION)) !== 'pdf') {
        throw new ApiException('该员工尚未上传健康证 PDF，无法核验');
    }

    $result = isset($in['result']) ? (string)$in['result'] : '';
    if (!in_array($result, array('pass', 'reject'), true)) throw new ApiException('请选择核验结论');
    $remark = trim(isset($in['remark']) ? (string)$in['remark'] : '');
    $remarkLen = function_exists('mb_strlen') ? mb_strlen($remark, 'UTF-8') : strlen($remark);
    if ($remarkLen > 500) throw new ApiException('核验备注不能超过 500 字');
    if ($result === 'reject' && $remark === '') throw new ApiException('核验不通过时必须填写备注');

    $materialKey = isset($in['materialKey']) ? (string)$in['materialKey'] : '';
    $materialName = isset($in['materialName']) ? (string)$in['materialName'] : '';
    if ($materialKey !== '') {
        $st = db()->prepare('SELECT file_key FROM files WHERE file_key = ?');
        $st->execute(array($materialKey));
        if (!$st->fetch()) throw new ApiException('核验材料不存在，请重新上传');
        $materialName = str_limit($materialName !== '' ? $materialName : basename($materialKey), 160);
    }

    $id = 'HV' . date('YmdHis') . bin2hex(function_exists('random_bytes') ? random_bytes(3) : unpack('H*', uniqid('', true)));
    $id = substr($id, 0, 32);
    $now = now_dt();
    $st = db()->prepare('INSERT INTO health_cert_verifications
        (id, staff_id, cert_key, result, remark, material_key, material_name, verified_by, verified_name, verified_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute(array(
        $id, $sid, $certKey, $result, $remark,
        $materialKey, $materialName,
        $acc['staff_id'], $acc['name'], $now, $now
    ));
    audit_log('健康证核验', $staff['name'], ($result === 'pass' ? '通过' : '不通过') . ($remark !== '' ? '：' . $remark : ''));

    $row = array(
        'id' => $id, 'staff_id' => $sid, 'cert_key' => $certKey, 'result' => $result,
        'remark' => $remark, 'material_key' => $materialKey, 'material_name' => $materialName,
        'verified_by' => $acc['staff_id'], 'verified_name' => $acc['name'], 'verified_at' => $now
    );
    return array('record' => hcv_out($row));
}
