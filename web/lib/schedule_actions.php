<?php
/* schedule_actions.php — 员工日程（创建 / 关联人 / 到点提醒） */

function schedule_staff_map()
{
    $map = array();
    foreach (db()->query('SELECT * FROM staff')->fetchAll() as $s) $map[$s['id']] = $s;
    return $map;
}

/* 关联人：schedule_id => array(staffId => staff row) */
function schedule_participant_map()
{
    $map = array();
    $staff = schedule_staff_map();
    foreach (db()->query('SELECT schedule_id, staff_id FROM schedule_participants')->fetchAll() as $r) {
        $sid = (string)$r['schedule_id'];
        $stid = (string)$r['staff_id'];
        if (!isset($staff[$stid])) continue;
        if (!isset($map[$sid])) $map[$sid] = array();
        $map[$sid][$stid] = $staff[$stid];
    }
    return $map;
}

function schedule_out_row($r, $staff, $participants, $viewerId)
{
    $ownerId = (string)$r['staff_id'];
    $ownerName = $staff ? display_name(isset($staff['name']) ? $staff['name'] : '', isset($staff['nickname']) ? $staff['nickname'] : '') : '';
    $parts = array();
    $ids = array();
    foreach ((array)$participants as $pid => $ps) {
        $ids[] = (string)$pid;
        $parts[] = array(
            'id' => (string)$pid,
            'name' => display_name(isset($ps['name']) ? $ps['name'] : '', isset($ps['nickname']) ? $ps['nickname'] : '')
        );
    }
    return array(
        'id' => (string)$r['id'],
        'staffId' => $ownerId,
        'staffName' => $ownerName,
        'creatorId' => $ownerId,
        'creatorName' => $ownerName,
        'isOwner' => $ownerId === (string)$viewerId,
        'isInvited' => $ownerId !== (string)$viewerId && in_array((string)$viewerId, $ids, true),
        'participants' => $parts,
        'participantIds' => $ids,
        'title' => (string)$r['title'],
        'date' => (string)$r['schedule_date'],
        'startTime' => substr((string)$r['start_time'], 0, 5),
        'endTime' => $r['end_time'] ? substr((string)$r['end_time'], 0, 5) : '',
        'location' => (string)$r['location'],
        'remark' => (string)$r['remark'],
        'remindMinutes' => (int)$r['remind_minutes'],
        'status' => (string)$r['status'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => $r['updated_at'] ? iso($r['updated_at']) : ''
    );
}

function schedule_can_view_all($acc, $staff)
{
    if (in_array($acc['role'], array('admin', 'superadmin'), true)) return true;
    return $staff && in_array($staff['position'], array('店长', '店助'), true);
}

/* 关联人清单：仅本店在职员工，不能包含自己；最多 20 人 */
function schedule_clean_participants($input, $selfId)
{
    if (!is_array($input)) $input = $input === '' ? array() : explode(',', (string)$input);
    $out = array();
    foreach ($input as $id) {
        $id = trim((string)$id);
        if ($id === '' || $id === (string)$selfId) continue;
        $st = staff_by_id($id);
        if (!$st || $st['status'] !== 'active') continue;
        if (!in_array($id, $out, true)) $out[] = $id;
        if (count($out) >= 20) break;
    }
    return $out;
}

function schedule_replace_participants($scheduleId, $ids)
{
    $del = db()->prepare('DELETE FROM schedule_participants WHERE schedule_id = ?');
    $del->execute(array($scheduleId));
    if (!$ids) return;
    $ins = db()->prepare('INSERT IGNORE INTO schedule_participants (schedule_id, staff_id, created_at) VALUES (?,?,?)');
    foreach ($ids as $id) $ins->execute(array($scheduleId, $id, now_dt()));
}

function api_schedule_list($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $scope = in_str($in, 'scope', 10) === 'all' ? 'all' : 'mine';
    if ($scope === 'all' && !schedule_can_view_all($acc, $staff)) $scope = 'mine';

    $sql = 'SELECT * FROM schedules WHERE status = ?';
    $args = array('active');
    if ($scope === 'mine') {
        $sql .= ' AND (staff_id = ? OR EXISTS (SELECT 1 FROM schedule_participants sp WHERE sp.schedule_id = schedules.id AND sp.staff_id = ?))';
        $args[] = $staff['id'];
        $args[] = $staff['id'];
    }
    $sql .= ' ORDER BY schedule_date ASC, start_time ASC LIMIT 300';
    $st = db()->prepare($sql);
    $st->execute($args);
    $staffMap = schedule_staff_map();
    $pMap = schedule_participant_map();
    $list = array();
    foreach ($st->fetchAll() as $r) {
        $sid = (string)$r['id'];
        $ownerId = (string)$r['staff_id'];
        $list[] = schedule_out_row(
            $r,
            isset($staffMap[$ownerId]) ? $staffMap[$ownerId] : array(),
            isset($pMap[$sid]) ? $pMap[$sid] : array(),
            (string)$staff['id']
        );
    }
    /* 访问时惰性推进提醒（不依赖 cron），失败不影响列表 */
    try { feishu_personal_schedule_tick(); } catch (Exception $e) { error_log('schedule remind failed: ' . $e->getMessage()); }
    return array('ok' => true, 'scope' => $scope, 'canViewAll' => schedule_can_view_all($acc, $staff), 'list' => $list);
}

function api_schedule_save($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $id = in_str($in, 'id', 24);
    $title = in_str($in, 'title', 120);
    if ($title === '') throw new ApiException('请填写日程标题');
    $date = in_str($in, 'date', 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');
    $start = in_str($in, 'startTime', 5);
    $end = in_str($in, 'endTime', 5);
    if (!preg_match('/^\d{2}:\d{2}$/', $start)) throw new ApiException('请填写开始时间');
    if ($end !== '' && !preg_match('/^\d{2}:\d{2}$/', $end)) throw new ApiException('结束时间格式不正确');
    if ($end !== '' && $end <= $start) throw new ApiException('结束时间必须晚于开始时间');
    if (strtotime($date . ' ' . $start) === false) throw new ApiException('日期或时间无效');
    if ($date < date('Y-m-d')) throw new ApiException('不能创建或改到已过去的日期');
    $location = in_str($in, 'location', 120);
    $remark = in_str($in, 'remark', 255);
    $remind = (int)in_num($in, 'remindMinutes', 0);
    if (!in_array($remind, array(0, -1, 5, 15, 30, 60), true)) throw new ApiException('提醒设置不正确');
    $participants = schedule_clean_participants(isset($in['participantIds']) ? $in['participantIds'] : array(), $staff['id']);

    if ($id !== '') {
        $st = db()->prepare('SELECT * FROM schedules WHERE id = ?');
        $st->execute(array($id));
        $row = $st->fetch();
        if (!$row || $row['staff_id'] !== $staff['id']) throw new ApiException('日程不存在或无权编辑', 'NOT_FOUND', 404);
        $st = db()->prepare('UPDATE schedules SET title = ?, schedule_date = ?, start_time = ?, end_time = ?, location = ?, remark = ?, remind_minutes = ?, status = ?, updated_at = ? WHERE id = ?');
        $st->execute(array($title, $date, $start . ':00', $end === '' ? null : $end . ':00', $location, $remark, $remind, 'active', now_dt(), $id));
        schedule_replace_participants($id, $participants);
        audit_log('编辑日程', $title, $date . ' ' . $start . ($participants ? '；关联 ' . count($participants) . ' 人' : ''));
    } else {
        $id = 'SC' . date('YmdHis') . substr((string)mt_rand(100, 999), 0, 3);
        $st = db()->prepare('INSERT INTO schedules (id, staff_id, title, schedule_date, start_time, end_time, location, remark, remind_minutes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute(array($id, $staff['id'], $title, $date, $start . ':00', $end === '' ? null : $end . ':00', $location, $remark, $remind, 'active', now_dt()));
        schedule_replace_participants($id, $participants);
        audit_log('新建日程', $title, $date . ' ' . $start . ($participants ? '；关联 ' . count($participants) . ' 人' : ''));
    }
    return array('ok' => true, 'id' => $id, 'participantIds' => $participants);
}

function api_schedule_cancel($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 24);
    $st = db()->prepare("UPDATE schedules SET status = 'cancelled', updated_at = ? WHERE id = ? AND staff_id = ?");
    $st->execute(array(now_dt(), $id, $acc['staff_id']));
    if ($st->rowCount() < 1) throw new ApiException('日程不存在或无权操作', 'NOT_FOUND', 404);
    return array('ok' => true);
}

function api_schedule_remove($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 24);
    $st = db()->prepare('DELETE FROM schedules WHERE id = ? AND staff_id = ?');
    $st->execute(array($id, $acc['staff_id']));
    if ($st->rowCount() < 1) throw new ApiException('日程不存在或无权操作', 'NOT_FOUND', 404);
    audit_log('删除日程', $id, '');
    return array('ok' => true);
}
