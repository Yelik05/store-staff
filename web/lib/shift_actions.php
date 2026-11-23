<?php
/* shift_actions.php — 兼职排班申请、审批（与排休分离，按用工性质分流） */

function shift_occupied($r)
{
    if ($r['status'] === 'approved') return !((int)$r['cancel_requested'] === 1);
    return $r['status'] === 'pending';
}

function shift_out($r)
{
    $slots = json_decode((string)$r['slots_json'], true);
    if (!is_array($slots)) $slots = array();
    return array(
        'id' => $r['id'],
        'staffId' => $r['staff_id'],
        'month' => $r['month'],
        'slots' => $slots,
        'note' => $r['note'],
        'status' => $r['status'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at']),
        'reviewedBy' => $r['reviewed_by'],
        'reviewedAt' => iso($r['reviewed_at']),
        'rejectReason' => $r['reject_reason'],
        'cancelRequested' => (bool)$r['cancel_requested'],
        'cancelRequestedAt' => iso($r['cancel_requested_at'])
    );
}

function shift_slots_clean($slots)
{
    if (!is_array($slots) || !$slots) throw new ApiException('请至少填写一个可上班的日期与时段');
    if (count($slots) > 31) throw new ApiException('单次最多提交 31 个时段，请分批提交');
    $out = array();
    $seen = array();
    foreach ($slots as $s) {
        if (!is_array($s)) continue;
        $date = substr(trim((string)(isset($s['date']) ? $s['date'] : '')), 0, 10);
        $start = substr(trim((string)(isset($s['start']) ? $s['start'] : '')), 0, 5);
        $end = substr(trim((string)(isset($s['end']) ? $s['end'] : '')), 0, 5);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效的上班日期');
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $end)) {
            throw new ApiException(substr($date, 5) . ' 的时段格式不正确，请按 09:00—14:00 填写');
        }
        if ($end <= $start) throw new ApiException(substr($date, 5) . ' 的结束时间需晚于开始时间');
        if (isset($seen[$date])) {
            foreach ($seen[$date] as $iv) {
                if ($start < $iv[1] && $end > $iv[0]) {
                    throw new ApiException(substr($date, 5) . ' 存在重叠时段，请调整后再提交');
                }
            }
        }
        $seen[$date][] = array($start, $end);
        $out[] = array('date' => $date, 'start' => $start, 'end' => $end);
    }
    if (!$out) throw new ApiException('请至少填写一个可上班的日期与时段');
    return $out;
}

function shift_conflict($staffId, $slots, $excludeId = '')
{
    $st = db()->prepare("SELECT * FROM shift_requests WHERE staff_id = ? AND status IN ('pending','approved') AND id <> ?");
    $st->execute(array($staffId, $excludeId));
    foreach ($st->fetchAll() as $r) {
        if (!shift_occupied($r)) continue;
        $old = json_decode((string)$r['slots_json'], true);
        if (!is_array($old)) continue;
        foreach ($old as $o) {
            foreach ($slots as $n) {
                if ($o['date'] !== $n['date']) continue;
                if ($n['start'] < $o['end'] && $n['end'] > $o['start']) {
                    throw new ApiException(substr($n['date'], 5) . ' 已提交过重叠时段的排班申请，请先撤回或调整时间', 'CONFLICT', 400);
                }
            }
        }
    }
}

function api_shift_my($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $month = in_str($in, 'month', 7);
    if ($month === '') $month = month_of(today_d());
    $st = db()->prepare('SELECT * FROM shift_requests WHERE staff_id = ? AND month = ? ORDER BY created_at DESC');
    $st->execute(array($staff['id'], $month));
    $list = array_map('shift_out', $st->fetchAll());
    $pending = 0;
    $approved = 0;
    foreach ($list as $r) {
        if (!$r['slots']) continue;
        if ($r['status'] === 'pending') $pending += count($r['slots']);
        if ($r['status'] === 'approved') $approved += count($r['slots']);
    }
    $settings = settings_data();
    return array(
        'month' => $month,
        'list' => $list,
        'pendingSlots' => $pending,
        'approvedSlots' => $approved,
        'rules' => $settings['restRules']
    );
}

function api_shift_apply($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    if ($staff['employment_type'] === '全职') {
        throw new ApiException('全职员工请使用「排休申请」，排班申请仅面向兼职/小时工', 'WRONG_TYPE', 400);
    }
    $slots = shift_slots_clean(isset($in['slots']) ? $in['slots'] : null);
    $curMonth = month_of(today_d());
    foreach ($slots as $s) {
        if (month_of($s['date']) !== $curMonth) throw new ApiException('排班需选择当月日期');
        /* 允许提交当天及未来日期；仍不允许提交已过去的日期 */
        if (diff_days($s['date'], today_d()) < 0) {
            throw new ApiException('上班日期不能早于今天，请选择今天或之后的日期');
        }
    }
    shift_conflict($staff['id'], $slots);
    $month = $curMonth;
    $id = next_shift_id($month);
    $st = db()->prepare("INSERT INTO shift_requests (id, staff_id, month, slots_json, note, status, created_at, updated_at, reviewed_by, reviewed_at, reject_reason, cancel_requested, cancel_requested_at) VALUES (?,?,?,?,?,'pending',?,NULL,'',NULL,'',0,NULL)");
    $st->execute(array($id, $staff['id'], $month, json_encode($slots, JSON_UNESCAPED_UNICODE), in_str($in, 'note', 255), now_dt()));
    audit_log('提交排班申请', $staff['name'], count($slots) . ' 个时段');
    return array('id' => $id, 'status' => 'pending', 'count' => count($slots));
}

function api_shift_cancel($in)
{
    $acc = require_login();
    $st = db()->prepare('SELECT * FROM shift_requests WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('申请不存在', 'NOT_FOUND', 404);
    if ($r['staff_id'] !== $acc['staff_id'] && $acc['role'] !== 'admin' && $acc['role'] !== 'superadmin') {
        throw new ApiException('无权操作该申请', 'FORBIDDEN', 403);
    }
    $action = in_str($in, 'action', 12);
    if ($action === 'withdraw') {
        if ($r['status'] !== 'pending') throw new ApiException('该申请当前不可撤回');
        $st = db()->prepare("UPDATE shift_requests SET status='withdrawn', updated_at=? WHERE id=?");
        $st->execute(array(now_dt(), $r['id']));
    } else {
        if ($r['status'] !== 'approved') throw new ApiException('该申请当前不可取消');
        $st = db()->prepare('UPDATE shift_requests SET cancel_requested=1, cancel_requested_at=?, updated_at=? WHERE id=?');
        $st->execute(array(now_dt(), now_dt(), $r['id']));
    }
    $staff = staff_by_id($r['staff_id']);
    audit_log($action === 'withdraw' ? '撤回排班申请' : '申请取消排班', $staff ? $staff['name'] : '', $r['month']);
    return array('ok' => true, 'status' => $action === 'withdraw' ? 'withdrawn' : $r['status']);
}

function api_shift_list($in)
{
    require_admin();
    $month = in_str($in, 'month', 7);
    if ($month === '') $month = month_of(today_d());
    $status = in_str($in, 'status', 20, 'all');
    $position = in_str($in, 'position', 20, 'all');
    $date = in_str($in, 'date', 10);

    $st = db()->prepare("SELECT r.*, s.name AS staff_name, s.nickname AS staff_nickname, s.position, s.emp_no, s.employment_type FROM shift_requests r LEFT JOIN staff s ON s.id = r.staff_id WHERE r.month = ? ORDER BY r.created_at DESC");
    $st->execute(array($month));
    $list = array();
    foreach ($st->fetchAll() as $r) {
        if ($status !== 'all') {
            if ($status === 'cancelRequest') {
                if (!((int)$r['cancel_requested'] === 1 && $r['status'] === 'approved')) continue;
            } elseif ($r['status'] !== $status) {
                continue;
            }
        }
        if ($position !== 'all' && $r['position'] !== $position) continue;
        $created = $r['cancel_requested'] ? $r['cancel_requested_at'] : $r['created_at'];
        $waited = $created ? max(0, (int)floor((time() - strtotime($created)) / 3600)) : 0;
        $item = shift_out($r);
        if ($date !== '') {
            $only = array();
            foreach ($item['slots'] as $s) {
                if (isset($s['date']) && $s['date'] === $date) $only[] = $s;
            }
            if (!$only) continue;
            $item['slots'] = $only;
        }
        $item['kind'] = 'shift';
        $item['staffName'] = $r['staff_name'] ? $r['staff_name'] : '';
        $item['staffNickname'] = isset($r['staff_nickname']) ? $r['staff_nickname'] : '';
        $item['staffDisplayName'] = display_name($item['staffName'], $item['staffNickname']);
        $item['position'] = $r['position'] ? normalize_position($r['position']) : '';
        $item['empNo'] = $r['emp_no'] ? $r['emp_no'] : '';
        $item['employmentType'] = $r['employment_type'] ? $r['employment_type'] : '';
        $item['waitedHours'] = $waited;
        $list[] = $item;
    }
    $lastDate = function ($row) {
        $d = '';
        foreach ($row['slots'] as $s) {
            if (isset($s['date']) && $s['date'] > $d) $d = $s['date'];
        }
        return $d;
    };
    usort($list, function ($a, $b) use ($lastDate) {
        $c = strcmp($lastDate($b), $lastDate($a));
        if ($c !== 0) return $c;
        return strcmp((string)$b['createdAt'], (string)$a['createdAt']);
    });
    return array('list' => $list, 'total' => count($list), 'month' => $month);
}

function api_shift_review($in)
{
    $acc = require_admin();
    $st = db()->prepare('SELECT * FROM shift_requests WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('申请不存在', 'NOT_FOUND', 404);
    $staff = staff_by_id($r['staff_id']);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $action = in_str($in, 'action', 16);

    if ($action === 'cancel') {
        if ($r['status'] !== 'approved' || !(int)$r['cancel_requested']) throw new ApiException('该申请没有待处理的取消请求');
        $st = db()->prepare("UPDATE shift_requests SET status='cancelled', cancel_requested=0, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
        $st->execute(array($acc['name'], now_dt(), now_dt(), $r['id']));
        audit_log('同意取消排班', $staff['name'], $r['month']);
        push_message($r['staff_id'], 'shift', '排班取消已通过', $r['month'] . ' 的排班取消申请已通过。', 'leave.html', $r['id']);
        return array('status' => 'cancelled');
    }
    if ($action === 'declineCancel') {
        if ($r['status'] !== 'approved' || !(int)$r['cancel_requested']) throw new ApiException('该申请没有待处理的取消请求');
        $st = db()->prepare('UPDATE shift_requests SET cancel_requested=0, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?');
        $st->execute(array($acc['name'], now_dt(), now_dt(), $r['id']));
        audit_log('不同意取消排班', $staff['name'], $r['month']);
        return array('status' => 'approved');
    }
    if ($action === 'approve') {
        if ($r['status'] !== 'pending') throw new ApiException('该申请已处理');
        $st = db()->prepare("UPDATE shift_requests SET status='approved', reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
        $st->execute(array($acc['name'], now_dt(), now_dt(), $r['id']));
        audit_log('通过排班申请', $staff['name'], $r['month'] . ' 共 ' . count(json_decode((string)$r['slots_json'], true)) . ' 个时段');
        push_message($r['staff_id'], 'shift', '排班申请已通过', $r['month'] . ' 的排班申请已通过。', 'leave.html', $r['id']);
        return array('status' => 'approved');
    }

    $reason = in_str($in, 'reason', 255);
    $len = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);
    if ($len < 5) throw new ApiException('请填写至少 5 个字的驳回原因，便于员工调整申请');
    $st = db()->prepare("UPDATE shift_requests SET status='rejected', reject_reason=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=?");
    $st->execute(array($reason, $acc['name'], now_dt(), now_dt(), $r['id']));
    audit_log('驳回排班申请', $staff['name'], $r['month'] . '，原因：' . $reason);
    push_message($r['staff_id'], 'shift', '排班申请被驳回', $r['month'] . ' 的排班申请被驳回：' . $reason, 'leave.html', $r['id']);
    return array('status' => 'rejected');
}
