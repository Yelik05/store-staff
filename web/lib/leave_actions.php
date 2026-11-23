<?php
/* leave_actions.php — 排休申请、审批与月度台账 */

function occupied_leave($l)
{
    if ($l['status'] === 'approved') return !((int)$l['cancel_requested'] === 1);
    return $l['status'] === 'pending';
}

function api_leave_day_stats($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $date = in_str($in, 'date', 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');

    $st = db()->prepare("SELECT l.status, s.position FROM leaves l LEFT JOIN staff s ON s.id = l.staff_id WHERE DATE(l.date) = ? AND l.status IN ('pending','approved')");
    $st->execute(array($date));
    $approved = 0;
    $pending = 0;
    $samePosition = 0;
    foreach ($st->fetchAll() as $r) {
        if ($r['status'] === 'approved') $approved++;
        else $pending++;
        if ($r['position'] === $staff['position']) $samePosition++;
    }

    $settings = settings_data();
    $posLimit = (int)$settings['restRules']['maxPerPosition'];
    $dayLimit = (int)$settings['restRules']['maxPerDay'];
    $storeRemaining = max(0, $dayLimit - ($approved + $pending));
    $posRemaining = max(0, $posLimit - $samePosition);

    return array(
        'date' => $date,
        'approved' => $approved,
        'pending' => $pending,
        'total' => $approved + $pending,
        'storeLimit' => $dayLimit,
        'storeRemaining' => $storeRemaining,
        'positionLimit' => $posLimit,
        'positionRemaining' => $posRemaining,
        'remaining' => min($storeRemaining, $posRemaining)
    );
}

function api_leave_my($in)
{
    $acc = require_login();
    $month = in_str($in, 'month', 7);
    $stats = leave_stats($acc['staff_id'], $month);
    $settings = settings_data();
    return array(
        'month' => $month,
        'quota' => $stats['quota'],
        'used' => $stats['used'],
        'pending' => $stats['pending'],
        'remaining' => $stats['remaining'],
        'unused' => $stats['unused'],
        'byType' => $stats['byType'],
        'list' => $stats['list'],
        'rules' => $settings['restRules']
    );
}

/* 超管员工端排班审批：排休 + 兼职排班按日期合并，日期降序；可选日期筛选 */
function api_leave_quick($in)
{
    require_super();
    $date = in_str($in, 'date', 10, '');
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');

    $curMonth = month_of(today_d());
    $days = array();
    $addItem = function ($dkey, $item) use (&$days) {
        $dkey = substr((string)$dkey, 0, 10);
        if (!isset($days[$dkey])) $days[$dkey] = array('date' => $dkey, 'items' => array());
        $days[$dkey]['items'][] = $item;
    };

    $leaveSql = "SELECT l.*, s.name AS staff_name, s.nickname AS staff_nickname, s.position, s.emp_no, s.feishu_emp_no, s.employment_type
        FROM leaves l LEFT JOIN staff s ON s.id = l.staff_id ";
    /* 排休：待审批全部 + 本月已通过 */
    $st = db()->prepare($leaveSql . "WHERE l.status = 'pending' OR (l.status = 'approved' AND DATE_FORMAT(l.date, '%Y-%m') = ?)");
    $st->execute(array($curMonth));
    foreach ($st->fetchAll() as $l) {
        $item = leave_quick_item($l);
        $item['date'] = substr((string)$l['date'], 0, 10);
        $addItem($item['date'], $item);
    }

    $shiftSql = "SELECT r.*, s.name AS staff_name, s.nickname AS staff_nickname, s.position, s.emp_no, s.feishu_emp_no, s.employment_type
        FROM shift_requests r LEFT JOIN staff s ON s.id = r.staff_id ";
    /* 排班：待审批全部 + 本月已通过；按日期拆分时段 */
    $st = db()->prepare($shiftSql . "WHERE r.status = 'pending' OR (r.status = 'approved' AND r.month = ?)");
    $st->execute(array($curMonth));
    foreach ($st->fetchAll() as $r) {
        $byDate = array();
        $slots = json_decode((string)$r['slots_json'], true);
        if (!is_array($slots)) $slots = array();
        foreach ($slots as $s) {
            if (!isset($s['date'])) continue;
            $dkey = substr((string)$s['date'], 0, 10);
            if (!isset($byDate[$dkey])) $byDate[$dkey] = array();
            $byDate[$dkey][] = $s;
        }
        foreach ($byDate as $dkey => $only) {
            $item = shift_quick_item($r);
            $item['date'] = $dkey;
            $item['slots'] = $only;
            $addItem($dkey, $item);
        }
    }

    $outDays = array();
    foreach ($days as $dkey => $b) {
        $people = array();
        $shiftPeople = array();
        $leaveCount = 0;
        $shiftSlots = 0;
        $pendingCount = 0;
        foreach ($b['items'] as $it) {
            $people[$it['staffId']] = true;
            if ($it['status'] === 'pending') $pendingCount++;
            if ($it['kind'] === 'leave') $leaveCount++;
            else {
                $shiftPeople[$it['staffId']] = true;
                $shiftSlots += count($it['slots']);
            }
        }
        usort($b['items'], function ($a, $b2) {
            if ($a['kind'] !== $b2['kind']) return $a['kind'] === 'leave' ? -1 : 1;
            if ($a['kind'] === 'shift') {
                $as = isset($a['slots'][0]['start']) ? $a['slots'][0]['start'] : '';
                $bs = isset($b2['slots'][0]['start']) ? $b2['slots'][0]['start'] : '';
                if ($as !== $bs) return strcmp($as, $bs);
            }
            return strcmp($a['staffName'], $b2['staffName']);
        });
        $outDays[] = array(
            'date' => $dkey,
            'items' => $b['items'],
            'leaveCount' => $leaveCount,
            'shiftPeople' => count($shiftPeople),
            'shiftSlots' => $shiftSlots,
            'pendingCount' => $pendingCount,
            'totalPeople' => count($people)
        );
    }
    usort($outDays, function ($a, $b) { return strcmp($b['date'], $a['date']); });

    if ($date !== '') $outDays = array_values(array_filter($outDays, function ($d) use ($date) {
        return $d['date'] === $date;
    }));

    $pendingTotal = (int)db()->query("SELECT COUNT(*) FROM leaves WHERE status = 'pending'")->fetchColumn()
        + (int)db()->query("SELECT COUNT(*) FROM shift_requests WHERE status = 'pending'")->fetchColumn();

    return array(
        'days' => $outDays,
        'date' => $date,
        'pendingTotal' => $pendingTotal
    );
}

function leave_quick_item($l)
{
    $item = leave_out($l);
    $item['kind'] = 'leave';
    $item['staffName'] = $l['staff_name'] ? $l['staff_name'] : '';
    $item['staffNickname'] = isset($l['staff_nickname']) ? $l['staff_nickname'] : '';
    $item['staffDisplayName'] = display_name($item['staffName'], $item['staffNickname']);
    $item['position'] = $l['position'] ? normalize_position($l['position']) : '';
    $item['empNo'] = $l['emp_no'] ? $l['emp_no'] : '';
    $item['feishuEmpNo'] = isset($l['feishu_emp_no']) ? $l['feishu_emp_no'] : '';
    $item['employmentType'] = $l['employment_type'] ? $l['employment_type'] : '';
    return $item;
}

function shift_quick_item($r)
{
    $item = shift_out($r);
    $item['kind'] = 'shift';
    $item['staffName'] = $r['staff_name'] ? $r['staff_name'] : '';
    $item['staffNickname'] = isset($r['staff_nickname']) ? $r['staff_nickname'] : '';
    $item['staffDisplayName'] = display_name($item['staffName'], $item['staffNickname']);
    $item['position'] = $r['position'] ? normalize_position($r['position']) : '';
    $item['empNo'] = $r['emp_no'] ? $r['emp_no'] : '';
    $item['feishuEmpNo'] = isset($r['feishu_emp_no']) ? $r['feishu_emp_no'] : '';
    $item['employmentType'] = $r['employment_type'] ? $r['employment_type'] : '';
    return $item;
}

function api_leave_apply($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    if ($staff['employment_type'] !== '全职') {
        throw new ApiException('兼职/小时工请使用「排班申请」提交可上班时段', 'WRONG_TYPE', 400);
    }
    $date = in_str($in, 'date', 10);
    if (!$date) throw new ApiException('请选择休息日期');
    if (month_of($date) !== month_of(today_d())) throw new ApiException('排休需选择当月日期');
    $settings = settings_data();
    $rules = $settings['restRules'];
    /* 允许申请当天及未来日期；仍不允许申请已过去的日期 */
    if (diff_days($date, today_d()) < 0) {
        throw new ApiException('休息日期不能早于今天，请选择今天或之后的日期');
    }
    $st = db()->prepare("SELECT * FROM leaves WHERE staff_id = ? AND date = ? AND status IN ('pending','approved')");
    $st->execute(array($staff['id'], $date));
    if ($st->fetch()) throw new ApiException('你已申请该日期排休，请勿重复提交');

    $st = db()->prepare("SELECT l.*, s.position, s.name FROM leaves l LEFT JOIN staff s ON s.id = l.staff_id WHERE l.date = ?");
    $st->execute(array($date));
    $dayRows = $st->fetchAll();
    $dayCount = 0;
    foreach ($dayRows as $l) {
        if (!occupied_leave($l)) continue;
        $dayCount++;
        if ($l['staff_id'] !== $staff['id'] && $l['position'] === $staff['position']) {
            throw new ApiException(substr($date, 5) . ' ' . $staff['position'] . '已有' . ($l['name'] ? $l['name'] : '同事') . '排休，同日仅可 1 人休息', 'CONFLICT', 400);
        }
    }
    $maxPerDay = isset($rules['maxPerDay']) ? (int)$rules['maxPerDay'] : 3;
    if ($dayCount >= $maxPerDay) {
        throw new ApiException('当日全店休息人数已达上限（' . $maxPerDay . ' 人），请选择其他日期');
    }

    $occupied = array();
    foreach ($dayRows as $l) {
        if ($l['staff_id'] === $staff['id'] && occupied_leave($l)) $occupied[] = $l['date'];
    }
    $occupied[] = $date;
    $streak = 1;
    $d = date('Y-m-d', strtotime($date . ' -1 day'));
    while (in_array($d, $occupied, true)) { $streak++; $d = date('Y-m-d', strtotime($d . ' -1 day')); }
    $d = date('Y-m-d', strtotime($date . ' +1 day'));
    while (in_array($d, $occupied, true)) { $streak++; $d = date('Y-m-d', strtotime($d . ' +1 day')); }
    $maxStreak = isset($rules['maxConsecutive']) ? (int)$rules['maxConsecutive'] : 3;
    if ($streak > $maxStreak) throw new ApiException('连续休息超过 ' . $maxStreak . ' 天需店长特批，请调整日期');

    $month = month_of($date);
    $id = next_leave_id($month);
    $type = in_str($in, 'type', 20, '事假');
    if (!in_array($type, array('事假', '病假'), true)) throw new ApiException('休息类型不正确，仅支持事假或病假');
    $reason = in_str($in, 'reason', 255);
    $st = db()->prepare("INSERT INTO leaves (id, staff_id, date, type, reason, status, manual, created_at, updated_at, reviewed_by, reviewed_at, reject_reason, cancel_requested, cancel_requested_at, force_reason) VALUES (?,?,?,?,?,'pending',0,?,NULL,'',NULL,'',0,NULL,'')");
    $st->execute(array($id, $staff['id'], $date, $type, $reason, now_dt()));
    audit_log('提交排休申请', $staff['name'], $date . ' ' . $type);
    return array('id' => $id, 'status' => 'pending');
}

function api_leave_cancel($in)
{
    $acc = require_login();
    $st = db()->prepare('SELECT * FROM leaves WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $l = $st->fetch();
    if (!$l) throw new ApiException('申请不存在', 'NOT_FOUND', 404);
    if ($l['staff_id'] !== $acc['staff_id'] && $acc['role'] !== 'admin' && $acc['role'] !== 'superadmin') {
        throw new ApiException('无权操作该申请', 'FORBIDDEN', 403);
    }
    $action = in_str($in, 'action', 12);
    if ($action === 'withdraw') {
        if ($l['status'] !== 'pending') throw new ApiException('该申请当前不可撤回');
        $st = db()->prepare("UPDATE leaves SET status='withdrawn', updated_at=? WHERE id=?");
        $st->execute(array(now_dt(), $l['id']));
    } else {
        if ($l['status'] !== 'approved') throw new ApiException('该申请当前不可取消');
        $st = db()->prepare('UPDATE leaves SET cancel_requested=1, cancel_requested_at=?, updated_at=? WHERE id=?');
        $st->execute(array(now_dt(), now_dt(), $l['id']));
    }
    $staff = staff_by_id($l['staff_id']);
    audit_log($action === 'withdraw' ? '撤回排休申请' : '申请取消排休', $staff ? $staff['name'] : '', $l['date']);
    return array('ok' => true, 'status' => $action === 'withdraw' ? 'withdrawn' : $l['status']);
}

function api_leave_list($in)
{
    require_admin();
    $month = in_str($in, 'month', 7);
    if ($month === '') $month = month_of(today_d());
    $status = in_str($in, 'status', 20, 'all');
    $position = in_str($in, 'position', 20, 'all');
    $date = in_str($in, 'date', 10);

    $st = db()->prepare("SELECT l.*, s.name AS staff_name, s.nickname AS staff_nickname, s.position, s.emp_no, s.feishu_emp_no, s.employment_type FROM leaves l LEFT JOIN staff s ON s.id = l.staff_id WHERE DATE_FORMAT(l.date, '%Y-%m') = ? ORDER BY l.date DESC");
    $st->execute(array($month));
    $rows = $st->fetchAll();
    $list = array();
    foreach ($rows as $l) {
        if ($date !== '' && $l['date'] !== $date) continue;
        if ($status !== 'all') {
            if ($status === 'cancelRequest') {
                if (!((int)$l['cancel_requested'] === 1 && $l['status'] === 'approved')) continue;
            } elseif ($l['status'] !== $status) {
                continue;
            }
        }
        if ($position !== 'all' && $l['position'] !== $position) continue;
        $created = $l['cancel_requested'] ? $l['cancel_requested_at'] : $l['created_at'];
        $waited = $created ? max(0, (int)floor((time() - strtotime($created)) / 3600)) : 0;
        $item = leave_out($l);
        $item['staffName'] = $l['staff_name'] ? $l['staff_name'] : '';
        $item['staffNickname'] = isset($l['staff_nickname']) ? $l['staff_nickname'] : '';
        $item['staffDisplayName'] = display_name($item['staffName'], $item['staffNickname']);
        $item['position'] = $l['position'] ? normalize_position($l['position']) : '';
        $item['empNo'] = $l['emp_no'] ? $l['emp_no'] : '';
        $item['feishuEmpNo'] = isset($l['feishu_emp_no']) ? $l['feishu_emp_no'] : '';
        $item['employmentType'] = $l['employment_type'] ? $l['employment_type'] : '';
        $item['waitedHours'] = $waited;
        $item['stats'] = leave_stats($l['staff_id'], $month);
        $list[] = $item;
    }
    usort($list, function ($a, $b) {
        $c = strcmp($b['date'], $a['date']);
        if ($c !== 0) return $c;
        return strcmp((string)$b['createdAt'], (string)$a['createdAt']);
    });
    return array('list' => $list, 'total' => count($list), 'month' => $month);
}

function api_leave_review($in)
{
    $acc = require_admin();
    $st = db()->prepare('SELECT * FROM leaves WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $l = $st->fetch();
    if (!$l) throw new ApiException('申请不存在', 'NOT_FOUND', 404);
    $staff = staff_by_id($l['staff_id']);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $month = month_of($l['date']);
    $action = in_str($in, 'action', 16);

    if ($action === 'cancel') {
        if ($l['status'] !== 'approved' || !(int)$l['cancel_requested']) throw new ApiException('该申请没有待处理的取消请求');
        $st = db()->prepare("UPDATE leaves SET status='cancelled', cancel_requested=0, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
        $st->execute(array($acc['name'], now_dt(), now_dt(), $l['id']));
        $stats = leave_stats($l['staff_id'], $month);
        audit_log('同意取消排休', $staff['name'], $l['date']);
        push_message($l['staff_id'], 'leave', '排休取消已通过', $l['date'] . ' 的排休取消申请已通过，已休天数已扣回。', 'leave.html', $l['id']);
        return array('status' => 'cancelled', 'usedRestDays' => $stats['used']);
    }
    if ($action === 'declineCancel') {
        if ($l['status'] !== 'approved' || !(int)$l['cancel_requested']) throw new ApiException('该申请没有待处理的取消请求');
        $st = db()->prepare('UPDATE leaves SET cancel_requested=0, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?');
        $st->execute(array($acc['name'], now_dt(), now_dt(), $l['id']));
        $stats = leave_stats($l['staff_id'], $month);
        audit_log('不同意取消排休', $staff['name'], $l['date']);
        return array('status' => 'approved', 'usedRestDays' => $stats['used']);
    }
    if ($action === 'approve') {
        if ($l['status'] !== 'pending') throw new ApiException('该申请已处理');
        $st = db()->prepare("SELECT l.*, s.name FROM leaves l LEFT JOIN staff s ON s.id = l.staff_id WHERE l.date = ? AND l.id <> ?");
        $st->execute(array($l['date'], $l['id']));
        $conflict = null;
        foreach ($st->fetchAll() as $x) {
            if (occupied_leave($x) && $x['staff_id'] !== $l['staff_id'] && staff_by_id($x['staff_id'])) {
                $other = staff_by_id($x['staff_id']);
                if ($other && $other['position'] === $staff['position']) { $conflict = $x; break; }
            }
        }
        $force = in_bool($in, 'force');
        if ($conflict && !$force) {
            throw new ApiException('该日' . $staff['position'] . '已有' . ($conflict['name'] ? $conflict['name'] : '同事') . '排休，同日仅可 1 人休息', 'CONFLICT', 400, array('conflictName' => $conflict['name']));
        }
        $reason = in_str($in, 'reason', 255);
        $st = db()->prepare("UPDATE leaves SET status='approved', reviewed_by=?, reviewed_at=?, updated_at=?, force_reason=? WHERE id=?");
        $st->execute(array($acc['name'], now_dt(), now_dt(), ($conflict && $force) ? $reason : '', $l['id']));
        ensure_attendance($l['staff_id'], $month, $acc['name']);
        $stats = leave_stats($l['staff_id'], $month);
        audit_log('通过排休申请', $staff['name'], $l['date'] . '，本月已休 ' . $stats['used'] . '/' . $stats['quota']);
        push_message($l['staff_id'], 'leave', '排休申请已通过', $l['date'] . ' 的' . $l['type'] . '申请已通过。', 'leave.html', $l['id']);
        return array('status' => 'approved', 'usedRestDays' => $stats['used'], 'quota' => $stats['quota'], 'overQuota' => $stats['used'] > $stats['quota']);
    }

    $reason = in_str($in, 'reason', 255);
    $len = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);
    if ($len < 5) throw new ApiException('请填写至少 5 个字的驳回原因，便于员工调整申请');
    $st = db()->prepare("UPDATE leaves SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
    $st->execute(array($reason, $acc['name'], now_dt(), now_dt(), $l['id']));
    audit_log('驳回排休申请', $staff['name'], $l['date'] . '，原因：' . $reason);
    push_message($l['staff_id'], 'leave', '排休申请被驳回', $l['date'] . ' 的' . $l['type'] . '申请被驳回：' . $reason, 'leave.html', $l['id']);
    return array('status' => 'rejected');
}

function api_leave_manual($in)
{
    $acc = require_admin();
    $staff = staff_by_id(isset($in['staffId']) ? (string)$in['staffId'] : '');
    if (!$staff) throw new ApiException('请选择员工');
    $date = in_str($in, 'date', 10);
    if (!$date) throw new ApiException('请选择日期');
    $st = db()->prepare("SELECT id FROM leaves WHERE staff_id = ? AND date = ? AND status IN ('pending','approved')");
    $st->execute(array($staff['id'], $date));
    if ($st->fetch()) throw new ApiException('该员工此日期已有排休申请');
    $month = month_of($date);
    $id = next_leave_id($month);
    $type = in_str($in, 'type', 20, '事假');
    if (!in_array($type, array('事假', '病假'), true)) throw new ApiException('休息类型不正确，仅支持事假或病假');
    $reason = in_str($in, 'reason', 255);
    $st = db()->prepare("INSERT INTO leaves (id, staff_id, date, type, reason, status, manual, created_at, updated_at, reviewed_by, reviewed_at, reject_reason, cancel_requested, cancel_requested_at, force_reason) VALUES (?,?,?,?,?,'approved',1,?,?,?,?,'',0,NULL,'')");
    $st->execute(array($id, $staff['id'], $date, $type, $reason, now_dt(), now_dt(), $acc['name'], now_dt()));
    ensure_attendance($staff['id'], $month, $acc['name']);
    audit_log('代员工补录排休', $staff['name'], $date . '（管理组代录）');
    return array('id' => $id, 'status' => 'approved');
}

function api_attendance_list($in)
{
    require_admin();
    $month = in_str($in, 'month', 7);
    if ($month === '') $month = month_of(today_d());
    $list = array();
    $sum = array('should' => 0, 'used' => 0, 'unused' => 0);
    foreach (active_staff_rows() as $s) {
        $stats = leave_stats($s['id'], $month);
        $att = ensure_attendance($s['id'], $month);
        $sum['should'] += $stats['quota'];
        $sum['used'] += $stats['used'];
        $sum['unused'] += $stats['unused'];
        $list[] = array(
            'staff' => array('id' => $s['id'], 'name' => $s['name'], 'position' => normalize_position($s['position']), 'employmentType' => $s['employment_type'], 'empNo' => $s['emp_no'] ? $s['emp_no'] : '', 'feishuEmpNo' => isset($s['feishu_emp_no']) ? $s['feishu_emp_no'] : ''),
            'shouldRestDays' => $stats['quota'],
            'usedRestDays' => $stats['used'],
            'pendingRestDays' => $stats['pending'],
            'remainingRestDays' => $stats['remaining'],
            'unusedRestDays' => $stats['unused'],
            'actualWorkDays' => (float)$att['actual_work_days'],
            'remark' => $att['remark']
        );
    }
    return array('month' => $month, 'list' => $list, 'total' => count($list), 'summary' => $sum);
}

function api_attendance_save($in)
{
    $acc = require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $staff = staff_by_id($staffId);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $patch = isset($in['patch']) && is_array($in['patch']) ? $in['patch'] : array();
    $att = ensure_attendance($staffId, $month, $acc['name']);
    $should = (float)$att['should_rest_days'];
    $actual = (float)$att['actual_work_days'];
    if (isset($patch['shouldRestDays'])) {
        $v = (float)$patch['shouldRestDays'];
        if ($v < 0 || $v > 31) throw new ApiException('应休天数需为 0—31 之间的数字');
        $should = $v;
    }
    if (isset($patch['actualWorkDays'])) {
        $v = (float)$patch['actualWorkDays'];
        if ($v < 0 || $v > 31) throw new ApiException('出勤天数需为 0—31 之间的数字');
        $actual = $v;
    }
    $st = db()->prepare('UPDATE attendance SET should_rest_days=?, actual_work_days=?, updated_by=?, updated_at=? WHERE staff_id=? AND month=?');
    $st->execute(array($should, $actual, $acc['name'], now_dt(), $staffId, $month));
    audit_log('调整考勤台账', $staff['name'], $month . ' 应休 ' . $should . ' 天，出勤 ' . $actual . ' 天');
    return array('ok' => true);
}

function api_attendance_detail($in)
{
    require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $stats = leave_stats($staffId, $month);
    return array('stats' => $stats, 'list' => $stats['list']);
}
