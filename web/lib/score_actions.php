<?php
/* score_actions.php — 量化分录入、发布、撤回与维度设置 */

function score_row($staffId, $month)
{
    $st = db()->prepare('SELECT * FROM scores WHERE staff_id = ? AND month = ?');
    $st->execute(array($staffId, $month));
    $row = $st->fetch();
    return $row ? $row : null;
}

function api_score_get($in)
{
    $acc = require_login();
    $row = score_row($acc['staff_id'], in_str($in, 'month', 7));
    if (!$row || $row['status'] !== 'published') return null;
    return score_out($row);
}

function api_score_my($in)
{
    $acc = require_login();
    $st = db()->prepare("SELECT * FROM scores WHERE staff_id = ? AND status = 'published' ORDER BY month ASC");
    $st->execute(array($acc['staff_id']));
    return array_map('score_out', $st->fetchAll());
}

function api_score_list($in)
{
    require_admin();
    $month = in_str($in, 'month', 7);
    $list = array();
    foreach (active_staff_rows() as $s) {
        $list[] = array(
            'staff' => array('id' => $s['id'], 'name' => $s['name'], 'position' => normalize_position($s['position']), 'empNo' => $s['emp_no'] ? $s['emp_no'] : '', 'feishuEmpNo' => isset($s['feishu_emp_no']) ? $s['feishu_emp_no'] : ''),
            'score' => score_out(score_row($s['id'], $month))
        );
    }
    return array('month' => $month, 'list' => $list, 'total' => count($list));
}

function api_score_save($in)
{
    $acc = require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $staff = staff_by_id($staffId);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) throw new ApiException('月份格式不正确');

    $settings = settings_data();
    $dimsCfg = $settings['dimensions'];
    $inputDims = isset($in['dims']) && is_array($in['dims']) ? $in['dims'] : array();
    $scores = array();
    foreach ($dimsCfg as $cfg) {
        $score = 0;
        foreach ($inputDims as $d) {
            if (isset($d['key']) && $d['key'] === $cfg['key']) {
                $raw = isset($d['score']) ? $d['score'] : 0;
                if ($raw === '' || !is_numeric($raw)) $raw = 0;
                $score = (float)$raw;
                break;
            }
        }
        if ($score < 0 || $score > (float)$cfg['full']) {
            throw new ApiException('“' . $cfg['name'] . '”得分需在 0—' . $cfg['full'] . ' 之间');
        }
        $scores[] = array('key' => $cfg['key'], 'name' => $cfg['name'], 'full' => (float)$cfg['full'], 'score' => round($score, 2));
    }

    $adjust = array();
    $inputAdjust = isset($in['adjust']) && is_array($in['adjust']) ? $in['adjust'] : array();
    foreach ($inputAdjust as $a) {
        $reason = isset($a['reason']) ? trim((string)$a['reason']) : '';
        if ($reason === '') throw new ApiException('加减分需填写事由');
        $value = isset($a['value']) ? (float)$a['value'] : 0;
        if (abs($value) < 1 || abs($value) > 5) throw new ApiException('加减分单次范围为 ±1 至 ±5');
        $adjust[] = array(
            'value' => $value,
            'reason' => str_limit($reason, 120),
            'date' => isset($a['date']) && $a['date'] ? substr((string)$a['date'], 0, 10) : today_d(),
            'by' => $acc['name']
        );
    }

    $total = 0;
    foreach ($scores as $d) $total += $d['score'];
    foreach ($adjust as $a) $total += $a['value'];
    $total = max(0, min(100, round($total, 2)));
    $grade = grade_of_total($total, $settings);

    $existing = score_row($staffId, $month);
    $status = $existing ? $existing['status'] : 'draft';
    $publishAt = $existing ? $existing['publish_at'] : null;
    $publishedBy = $existing ? $existing['published_by'] : '';
    $id = $staffId . '-' . $month;
    $dimsJson = json_encode($scores, JSON_UNESCAPED_UNICODE);
    $adjustJson = json_encode($adjust, JSON_UNESCAPED_UNICODE);

    if ($existing) {
        $st = db()->prepare('UPDATE scores SET dims_json=?, adjust_json=?, total=?, grade=?, status=?, publish_at=?, published_by=?, updated_by=?, updated_at=? WHERE id=?');
        $st->execute(array($dimsJson, $adjustJson, $total, $grade, $status, $publishAt, $publishedBy, $acc['name'], now_dt(), $existing['id']));
        if ($existing['status'] === 'published') {
            audit_log('修改已发布量化分', $staff['name'], $month . ' 总分 ' . $total);
        }
    } else {
        $st = db()->prepare('INSERT INTO scores (id, staff_id, month, dims_json, adjust_json, total, grade, status, publish_at, published_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,NULL,\'\',?,?)');
        $st->execute(array($id, $staffId, $month, $dimsJson, $adjustJson, $total, $grade, 'draft', $acc['name'], now_dt()));
    }
    return array('ok' => true, 'total' => $total, 'grade' => $grade);
}

/* 超管在用户主页直接加/扣量化分：写量化分记录、审计与站内通知 */
function api_score_adjust($in)
{
    $acc = require_super();
    $staffId = in_str($in, 'staffId', 16);
    $staff = staff_by_id($staffId);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    $value = isset($in['value']) ? (float)$in['value'] : 0;
    if (abs($value) < 1 || abs($value) > 5) throw new ApiException('加减分单次范围为 ±1 至 ±5');
    $reason = trim(isset($in['reason']) ? (string)$in['reason'] : '');
    if ($reason === '') throw new ApiException('请填写加减分原因');
    $reason = str_limit($reason, 120);

    $month = month_of(today_d());
    $settings = settings_data();
    $row = score_row($staffId, $month);
    if ($row) {
        $dims = json_field($row['dims_json'], array());
        $adjust = json_field($row['adjust_json'], array());
    } else {
        $dims = array();
        foreach ($settings['dimensions'] as $cfg) {
            $dims[] = array(
                'key' => $cfg['key'], 'name' => $cfg['name'],
                'full' => (float)$cfg['full'], 'score' => 0
            );
        }
        $adjust = array();
    }
    $adjust[] = array(
        'value' => round($value, 2),
        'reason' => $reason,
        'date' => today_d(),
        'by' => $acc['name']
    );

    $total = 0;
    foreach ($dims as $d) $total += isset($d['score']) ? (float)$d['score'] : 0;
    foreach ($adjust as $a) $total += isset($a['value']) ? (float)$a['value'] : 0;
    $total = max(0, min(100, round($total, 2)));
    $grade = grade_of_total($total, $settings);

    $dimsJson = json_encode($dims, JSON_UNESCAPED_UNICODE);
    $adjustJson = json_encode($adjust, JSON_UNESCAPED_UNICODE);
    if ($row) {
        $st = db()->prepare('UPDATE scores SET dims_json=?, adjust_json=?, total=?, grade=?, updated_by=?, updated_at=? WHERE id=?');
        $st->execute(array($dimsJson, $adjustJson, $total, $grade, $acc['name'], now_dt(), $row['id']));
    } else {
        $id = $staffId . '-' . $month;
        $st = db()->prepare("INSERT INTO scores (id, staff_id, month, dims_json, adjust_json, total, grade, status, publish_at, published_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,'draft',NULL,'',?,?)");
        $st->execute(array($id, $staffId, $month, $dimsJson, $adjustJson, $total, $grade, $acc['name'], now_dt()));
    }

    $sign = $value > 0 ? '+' : '';
    audit_log($value > 0 ? '量化分加分' : '量化分扣分', $staff['name'],
        $reason . '，' . $sign . round($value, 2) . ' 分，本月总分 ' . $total);
    push_message($staffId, 'score', '量化分调整',
        '你的量化分' . ($value > 0 ? '增加' : '扣除') . ' ' . abs($value) . ' 分：' . $reason .
        '。本月当前总分 ' . $total . ' 分。', 'score.html', $month);

    return array(
        'ok' => true,
        'score' => score_out(score_row($staffId, $month)),
        'total' => $total,
        'grade' => $grade
    );
}

function api_score_publish($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $settings = settings_data();
    $dimsCfg = $settings['dimensions'];
    $missing = array();
    $rows = active_staff_rows();
    foreach ($rows as $s) {
        $x = score_row($s['id'], $month);
        if (!$x) {
            $missing[] = $s['name'];
            continue;
        }
        $dims = json_field($x['dims_json'], array());
        $incomplete = false;
        foreach ($dimsCfg as $cfg) {
            $hit = null;
            foreach ($dims as $d) {
                if (isset($d['key']) && $d['key'] === $cfg['key']) { $hit = $d; break; }
            }
            if (!$hit || !isset($hit['score']) || $hit['score'] === '' || $hit['score'] === null) {
                $incomplete = true;
                break;
            }
        }
        if ($incomplete) $missing[] = $s['name'];
    }
    if ($missing) {
        throw new ApiException('还有 ' . count($missing) . ' 人未完成打分，暂不能发布', 'SCORE_INCOMPLETE', 400, array('missing' => $missing));
    }
    $count = 0;
    foreach ($rows as $s) {
        $x = score_row($s['id'], $month);
        if (!$x) continue;
        if ($x['status'] !== 'published') {
            $st = db()->prepare("UPDATE scores SET status='published', publish_at=?, published_by=?, updated_at=? WHERE id=?");
            $st->execute(array(now_dt(), $acc['name'], now_dt(), $x['id']));
        }
        $count++;
    }
    audit_log('发布量化分', $month, '共 ' . $count . ' 人');
    return array('ok' => true, 'count' => $count);
}

function api_score_withdraw($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $st = db()->prepare("SELECT * FROM scores WHERE month = ? AND status = 'published'");
    $st->execute(array($month));
    $rows = $st->fetchAll();
    if (!$rows) throw new ApiException('该月没有已发布的量化分');
    foreach ($rows as $x) {
        $pubDate = $x['publish_at'] ? substr($x['publish_at'], 0, 10) : '';
        if ($pubDate !== today_d() && $acc['role'] !== 'superadmin') {
            throw new ApiException('仅发布当天可撤回，' . $month . ' 的量化分已超过可撤回时间，请联系店长处理');
        }
    }
    $st = db()->prepare("UPDATE scores SET status='draft', publish_at=NULL, updated_at=? WHERE month=? AND status='published'");
    $st->execute(array(now_dt(), $month));
    audit_log('撤回量化分', $month, '撤回 ' . count($rows) . ' 人');
    return array('ok' => true, 'count' => count($rows));
}

function api_score_copy_last($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $prev = date('Y-m', strtotime($month . '-01 -1 month'));
    $count = 0;
    foreach (active_staff_rows() as $s) {
        if (score_row($s['id'], $month)) continue;
        $src = score_row($s['id'], $prev);
        if (!$src) continue;
        $adjust = json_field($src['adjust_json'], array());
        foreach ($adjust as $i => $a) {
            $adjust[$i]['date'] = $month . '-01';
        }
        $st = db()->prepare("INSERT INTO scores (id, staff_id, month, dims_json, adjust_json, total, grade, status, publish_at, published_by, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,'draft',NULL,'',?,?)");
        $st->execute(array(
            $s['id'] . '-' . $month, $s['id'], $month, $src['dims_json'],
            json_encode($adjust, JSON_UNESCAPED_UNICODE), $src['total'], $src['grade'],
            $acc['name'], now_dt()
        ));
        $count++;
    }
    if ($count) audit_log('套用上月量化分', $month, '套用 ' . $count . ' 人');
    return array('ok' => true, 'count' => $count);
}

function api_settings_dimensions($in)
{
    require_login();
    $s = settings_data();
    return $s['dimensions'];
}

function api_settings_save_dimensions($in)
{
    require_super();
    $dims = isset($in['dims']) && is_array($in['dims']) ? $in['dims'] : array();
    if (!$dims) throw new ApiException('至少保留一个量化维度');
    $out = array();
    $total = 0;
    foreach ($dims as $d) {
        $name = isset($d['name']) ? trim((string)$d['name']) : '';
        if ($name === '') throw new ApiException('维度名称不能为空');
        $full = isset($d['full']) ? (float)$d['full'] : 0;
        if ($full <= 0 || $full > 100) throw new ApiException('维度满分需为 1—100 之间的数字');
        $total += $full;
        $key = isset($d['key']) && $d['key'] ? (string)$d['key'] : ('d' . (count($out) + 1));
        $out[] = array(
            'key' => str_limit($key, 20),
            'name' => str_limit($name, 40),
            'full' => $full,
            'desc' => isset($d['desc']) ? str_limit((string)$d['desc'], 200) : ''
        );
    }
    if (abs($total - 100) > 0.001) throw new ApiException('维度满分合计须为 100 分，当前为 ' . round($total, 2) . ' 分');
    $settings = settings_data();
    $settings['dimensions'] = $out;
    save_settings_data($settings);
    audit_log('保存量化维度', '系统设置', implode('、', array_map(function ($x) { return $x['name'] . '(' . $x['full'] . ')'; }, $out)));
    return array('ok' => true);
}
