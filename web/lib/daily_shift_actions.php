<?php
/* 今日排班：岗位字典 + 员工当日排班（支持一天最多两个班段） */

function daily_shift_reminder_default()
{
    return '高峰转低峰请随手清洁，并检查岗位物料归位与密封';
}

function daily_shift_reminder_text()
{
    $s = settings_data();
    $t = isset($s['shiftReminder']) ? trim((string)$s['shiftReminder']) : '';
    return $t !== '' ? $t : daily_shift_reminder_default();
}

function daily_shift_station_out($r)
{
    return array(
        'id' => (string)$r['id'],
        'name' => (string)$r['name'],
        'sortOrder' => (int)$r['sort_order'],
        'enabled' => (int)$r['enabled'] === 1,
        'builtin' => (int)$r['builtin'] === 1
    );
}

function daily_shift_out($r)
{
    return array(
        'id' => (string)$r['id'],
        'staffId' => (string)$r['staff_id'],
        'date' => (string)$r['work_date'],
        'segmentNo' => isset($r['segment_no']) ? max(1, (int)$r['segment_no']) : 1,
        'startTime' => substr((string)$r['start_time'], 0, 5),
        'endTime' => substr((string)$r['end_time'], 0, 5),
        'stationId' => (string)$r['station_id'],
        'stationName' => (string)$r['station_name'],
        'task' => (string)$r['task'],
        'createdBy' => (string)$r['created_by'],
        'createdByName' => (string)$r['created_by_name'],
        'createdAt' => (string)$r['created_at'],
        'updatedAt' => (string)$r['updated_at']
    );
}

/* 某员工某日全部班段（按 segment_no 升序） */
function daily_shift_records($staffId, $day)
{
    $st = db()->prepare('SELECT * FROM daily_shifts WHERE staff_id = ? AND work_date = ? ORDER BY segment_no ASC, id ASC');
    $st->execute(array($staffId, $day));
    return array_map('daily_shift_out', $st->fetchAll());
}

function daily_shift_norm_day($v)
{
    $s = trim((string)$v);
    return preg_match('~^\d{4}-\d{2}-\d{2}$~', $s) ? $s : date('Y-m-d');
}

function daily_shift_to_min($t)
{
    $p = explode(':', (string)$t);
    return (int)(isset($p[0]) ? $p[0] : 0) * 60 + (int)(isset($p[1]) ? $p[1] : 0);
}

function daily_shift_segments_text($segs)
{
    $lines = array();
    foreach ($segs as $i => $s) {
        $lines[] = ($i + 1) . '. ' . $s['startTime'] . '-' . $s['endTime'] . ' ' . $s['stationName']
            . ($s['task'] !== '' ? ' · ' . $s['task'] : '');
    }
    return implode("\n", $lines);
}

/* 岗位字典（启用项） */
function api_shift_stations($in)
{
    require_login();
    $rows = db()->query('SELECT id, name, sort_order, enabled, builtin FROM shift_stations WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
    return array('list' => array_map('daily_shift_station_out', $rows));
}

/* 员工本人今日排班 */
function api_daily_shift_today($in)
{
    $acc = require_login();
    $day = date('Y-m-d');
    $records = daily_shift_records((string)$acc['staff_id'], $day);
    $rows = db()->query('SELECT id, name, sort_order, enabled, builtin FROM shift_stations WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
    return array(
        'date' => $day,
        'records' => $records,
        'record' => count($records) ? $records[0] : null,
        'reminder' => daily_shift_reminder_text(),
        'stations' => array_map('daily_shift_station_out', $rows)
    );
}

/* 超管：读取指定员工某日排班（用于回填，两段一起返回） */
function api_daily_shift_get($in)
{
    require_super();
    $staffId = isset($in['staffId']) ? trim((string)$in['staffId']) : '';
    if ($staffId === '') throw new ApiException('请选择员工');
    $day = daily_shift_norm_day(isset($in['date']) ? $in['date'] : '');
    $records = daily_shift_records($staffId, $day);
    return array(
        'date' => $day,
        'records' => $records,
        'record' => count($records) ? $records[0] : null,
        'reminder' => daily_shift_reminder_text()
    );
}

/* 超管：保存某员工某日排班（按员工 + 日期 + 班段覆盖） */
function api_daily_shift_save($in)
{
    $acc = require_super();
    $staffId = isset($in['staffId']) ? trim((string)$in['staffId']) : '';
    if ($staffId === '') throw new ApiException('请选择员工');
    $st = db()->prepare('SELECT id, name, status FROM staff WHERE id = ? LIMIT 1');
    $st->execute(array($staffId));
    $staff = $st->fetch();
    if (!$staff) throw new ApiException('员工不存在');
    if ($staff['status'] !== 'active') throw new ApiException('该员工不在职，无法设置排班');

    $day = daily_shift_norm_day(isset($in['date']) ? $in['date'] : '');

    $raw = array();
    if (isset($in['segments']) && is_array($in['segments']) && count($in['segments'])) {
        $raw = array_values($in['segments']);
    } else {
        $raw = array(array(
            'startTime' => isset($in['startTime']) ? $in['startTime'] : '',
            'endTime' => isset($in['endTime']) ? $in['endTime'] : '',
            'stationId' => isset($in['stationId']) ? $in['stationId'] : '',
            'task' => isset($in['task']) ? $in['task'] : ''
        ));
    }
    if (count($raw) > 2) throw new ApiException('同一员工同一天最多设置两个班段');

    $multi = count($raw) > 1;
    $segs = array();
    foreach ($raw as $i => $s) {
        $label = $multi ? ('第 ' . ($i + 1) . ' 段') : '';
        $start = trim((string)(isset($s['startTime']) ? $s['startTime'] : ''));
        $end = trim((string)(isset($s['endTime']) ? $s['endTime'] : ''));
        if (!preg_match('~^\d{2}:\d{2}$~', $start) || !preg_match('~^\d{2}:\d{2}$~', $end)) {
            throw new ApiException($label . '请填写正确的上班与下班时间');
        }
        if (daily_shift_to_min($end) <= daily_shift_to_min($start)) {
            throw new ApiException($label . '下班时间需晚于上班时间');
        }
        $stationId = isset($s['stationId']) ? trim((string)$s['stationId']) : '';
        $ss = db()->prepare('SELECT id, name, enabled FROM shift_stations WHERE id = ? LIMIT 1');
        $ss->execute(array($stationId));
        $station = $ss->fetch();
        if (!$station || (int)$station['enabled'] !== 1) throw new ApiException($label . '请选择有效的岗位');
        $task = trim(preg_replace('~\s+~u', ' ', (string)(isset($s['task']) ? $s['task'] : '')));
        $taskLen = function_exists('mb_strlen') ? mb_strlen($task, 'UTF-8') : strlen($task);
        if ($taskLen > 100) throw new ApiException($label . '低峰任务不能超过 100 字');
        $segs[] = array(
            'segmentNo' => $i + 1,
            'startTime' => $start,
            'endTime' => $end,
            'stationId' => $stationId,
            'stationName' => (string)$station['name'],
            'task' => $task
        );
    }

    for ($i = 0; $i < count($segs); $i++) {
        for ($j = $i + 1; $j < count($segs); $j++) {
            if (daily_shift_to_min($segs[$i]['startTime']) < daily_shift_to_min($segs[$j]['endTime'])
                && daily_shift_to_min($segs[$j]['startTime']) < daily_shift_to_min($segs[$i]['endTime'])) {
                throw new ApiException('第 ' . ($i + 1) . ' 段与第 ' . ($j + 1) . ' 段时间重叠，请调整');
            }
        }
    }

    $q = db()->prepare('SELECT * FROM daily_shifts WHERE staff_id = ? AND work_date = ? ORDER BY segment_no ASC');
    $q->execute(array($staffId, $day));
    $existingRows = $q->fetchAll();
    $existingBy = array();
    foreach ($existingRows as $r) {
        $existingBy[isset($r['segment_no']) ? max(1, (int)$r['segment_no']) : 1] = $r;
    }

    $unchanged = count($existingRows) === count($segs);
    if ($unchanged) {
        foreach ($segs as $s) {
            $r = isset($existingBy[$s['segmentNo']]) ? $existingBy[$s['segmentNo']] : null;
            if (!$r
                || substr((string)$r['start_time'], 0, 5) !== $s['startTime']
                || substr((string)$r['end_time'], 0, 5) !== $s['endTime']
                || (string)$r['station_id'] !== $s['stationId']
                || (string)$r['task'] !== $s['task']) {
                $unchanged = false;
                break;
            }
        }
    }
    if ($unchanged) {
        $records = daily_shift_records($staffId, $day);
        return array(
            'record' => count($records) ? $records[0] : null,
            'records' => $records,
            'pushed' => false,
            'unchanged' => true
        );
    }

    $now = now_dt();
    db()->beginTransaction();
    try {
        foreach ($segs as $s) {
            $startDb = $s['startTime'] . ':00';
            $endDb = $s['endTime'] . ':00';
            $row = isset($existingBy[$s['segmentNo']]) ? $existingBy[$s['segmentNo']] : null;
            if ($row) {
                $up = db()->prepare('UPDATE daily_shifts SET start_time = ?, end_time = ?, station_id = ?, station_name = ?, task = ?, updated_at = ? WHERE id = ?');
                $up->execute(array($startDb, $endDb, $s['stationId'], $s['stationName'], $s['task'], $now, $row['id']));
            } else {
                $id = 'SH' . date('YmdHis') . substr(md5($staffId . $day . $s['segmentNo'] . $now), 0, 6);
                $ins = db()->prepare('INSERT INTO daily_shifts (id, staff_id, work_date, segment_no, start_time, end_time, station_id, station_name, task, created_by, created_by_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $ins->execute(array($id, $staffId, $day, $s['segmentNo'], $startDb, $endDb, $s['stationId'], $s['stationName'], $s['task'], (string)$acc['id'], (string)$acc['name'], $now, $now));
            }
        }
        /* 删除多余班段（例如从两段改为一段时清理第二段） */
        $del = db()->prepare('DELETE FROM daily_shifts WHERE staff_id = ? AND work_date = ? AND segment_no > ?');
        $del->execute(array($staffId, $day, count($segs)));
        db()->commit();
    } catch (Exception $e) {
        db()->rollBack();
        throw $e;
    }

    $records = daily_shift_records($staffId, $day);
    $reminder = daily_shift_reminder_text();
    $segText = daily_shift_segments_text($segs);
    $sigParts = array();
    foreach ($segs as $s) {
        $sigParts[] = $s['startTime'] . '~' . $s['endTime'] . '~' . $s['stationId'] . '~' . $s['task'];
    }
    $sig = implode('|', $sigParts);
    $segPayload = array();
    foreach ($segs as $s) {
        $segPayload[] = array(
            'segmentNo' => $s['segmentNo'],
            'startTime' => $s['startTime'],
            'endTime' => $s['endTime'],
            'station' => $s['stationName'],
            'task' => $s['task']
        );
    }
    $first = $segs[0];
    $pushed = personal_webhook_push($staffId, 'dailyShift', '今日排班已更新',
        $day . ' 排班' . "\n" . $segText . "\n" . $reminder,
        'profile.html', 'SHIFT-' . $day . '-' . $staffId, (string)$acc['name'], array(
            'dedupeKey' => 'personal.shift|' . $staffId . '|' . $day . '|' . md5($sig),
            'payloadFields' => array(
                'shiftDate' => $day,
                'shiftSegments' => $segPayload,
                'shiftSegmentsText' => $segText,
                'shiftStartTime' => $first['startTime'],
                'shiftEndTime' => $first['endTime'],
                'shiftStation' => $first['stationName'],
                'shiftTask' => $first['task'],
                'shiftReminder' => $reminder
            )
        ));

    audit_log('设置今日排班', $staff['name'], $day . ' ' . str_replace("\n", ' / ', $segText));
    return array(
        'record' => count($records) ? $records[0] : null,
        'records' => $records,
        'pushed' => $pushed,
        'unchanged' => false,
        'reminder' => $reminder
    );
}

/* 超管：一次取齐某日全部在职员工、班段、岗位与低峰任务字典（排班表用） */
function api_daily_shift_board($in)
{
    require_super();
    $day = daily_shift_norm_day(isset($in['date']) ? $in['date'] : '');

    $staffRows = db()->query("SELECT id, name, avatar, position, emp_no, feishu_emp_no FROM staff WHERE status = 'active' ORDER BY name ASC")->fetchAll();

    $q = db()->prepare('SELECT * FROM daily_shifts WHERE work_date = ? ORDER BY segment_no ASC, id ASC');
    $q->execute(array($day));
    $byStaff = array();
    foreach ($q->fetchAll() as $r) {
        $sid = (string)$r['staff_id'];
        if (!isset($byStaff[$sid])) $byStaff[$sid] = array();
        $byStaff[$sid][] = daily_shift_out($r);
    }

    $staff = array();
    foreach ($staffRows as $s) {
        $sid = (string)$s['id'];
        /* 工号展示规则与前端一致：飞书工号优先，为空时回退门店工号 */
        $empNo = trim((string)(isset($s['feishu_emp_no']) && $s['feishu_emp_no'] !== '' ? $s['feishu_emp_no'] : $s['emp_no']));
        $staff[] = array(
            'id' => $sid,
            'name' => (string)$s['name'],
            'avatar' => isset($s['avatar']) ? (string)$s['avatar'] : '',
            'position' => isset($s['position']) ? (string)$s['position'] : '',
            'empNo' => $empNo,
            'records' => isset($byStaff[$sid]) ? $byStaff[$sid] : array()
        );
    }

    $stRows = db()->query('SELECT id, name, sort_order, enabled, builtin FROM shift_stations WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
    $taskRows = db()->query("SELECT DISTINCT task FROM daily_shifts WHERE task IS NOT NULL AND task <> '' ORDER BY task ASC")->fetchAll();
    $tasks = array();
    foreach ($taskRows as $t) $tasks[] = (string)$t['task'];

    return array(
        'date' => $day,
        'staff' => $staff,
        'stations' => array_map('daily_shift_station_out', $stRows),
        'tasks' => $tasks,
        'reminder' => daily_shift_reminder_text()
    );
}

/* 超管：清空某员工某日全部班段（保持 daily_shifts 两段结构，不新增表） */
function api_daily_shift_clear($in)
{
    require_super();
    $staffId = isset($in['staffId']) ? trim((string)$in['staffId']) : '';
    if ($staffId === '') throw new ApiException('请选择员工');
    $st = db()->prepare('SELECT id, name FROM staff WHERE id = ? LIMIT 1');
    $st->execute(array($staffId));
    $staff = $st->fetch();
    if (!$staff) throw new ApiException('员工不存在');

    $day = daily_shift_norm_day(isset($in['date']) ? $in['date'] : '');
    $del = db()->prepare('DELETE FROM daily_shifts WHERE staff_id = ? AND work_date = ?');
    $del->execute(array($staffId, $day));
    $removed = (int)$del->rowCount();
    if ($removed > 0) audit_log('清空排班', (string)$staff['name'], $day . ' 共 ' . $removed . ' 段');
    return array('ok' => true, 'removed' => $removed);
}
