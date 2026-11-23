<?php
/* attendance_actions.php — 考勤日报导入与员工端「我的考勤」 */

function attendance_daily_round2($v)
{
    return round((float)$v, 2);
}

function attendance_daily_time($v)
{
    return $v ? substr((string)$v, 0, 5) : '';
}

/* 日期正则：使用 ~ 作分隔符。原实现用 / 作分隔符，字符类里的 / 会提前结束模式，
 * 导致 preg_match 直接失败（返回 false），任何日期都会被判为无效。 */
function attendance_date_pattern()
{
    return '~(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})~u';
}

/* 逐步返回日期校验过程，供导入与自检页共用，避免两处逻辑漂移 */
function attendance_norm_date_trace($v)
{
    $t = array(
        'raw' => $v,
        'trimmed' => '',
        'normalized' => '',
        'numeric' => '',
        'regex_ok' => false,
        'regex_match' => array(),
        'checkdate' => null,
        'result' => ''
    );
    $s = trim((string)$v);
    $t['trimmed'] = $s;
    if ($s === '') return $t;
    /* 全角数字与全角空格归一 */
    $s = strtr($s, array('０' => '0', '１' => '1', '２' => '2', '３' => '3', '４' => '4', '５' => '5', '６' => '6', '７' => '7', '８' => '8', '９' => '9', "\xE3\x80\x80" => ' '));
    $t['normalized'] = $s;
    if (preg_match('/^\d{13}$/', $s)) { $t['numeric'] = '13 位毫秒时间戳'; $t['result'] = gmdate('Y-m-d', (int)floor(((float)$s) / 1000)); return $t; }
    if (preg_match('/^\d{10}$/', $s)) { $t['numeric'] = '10 位秒时间戳'; $t['result'] = gmdate('Y-m-d', (int)$s); return $t; }
    if (preg_match('/^\d+(\.\d+)?$/', $s)) {
        $n = (float)$s;
        if ($n > 20000 && $n < 80000) {
            $t['numeric'] = 'Excel 日期序列号';
            $t['result'] = gmdate('Y-m-d', (int)round(($n - 25569) * 86400));
            return $t;
        }
    }
    $m = array();
    $ok = preg_match(attendance_date_pattern(), $s, $m) || preg_match('/^(\d{4})(\d{2})(\d{2})$/', $s, $m);
    $t['regex_ok'] = (bool)$ok;
    $t['regex_match'] = $m;
    if ($ok) {
        $mo = (int)$m[2];
        $da = (int)$m[3];
        $t['checkdate'] = checkdate($mo, $da, (int)$m[1]);
        if ($t['checkdate']) $t['result'] = $m[1] . '-' . sprintf('%02d', $mo) . '-' . sprintf('%02d', $da);
    }
    return $t;
}

function attendance_norm_date($v)
{
    $t = attendance_norm_date_trace($v);
    return $t['result'];
}

function attendance_norm_time($v)
{
    $s = trim((string)$v);
    if ($s === '') return null;
    if (preg_match('/^\d*\.\d+$/', $s)) {
        $f = (float)$s;
        if ($f >= 0 && $f < 1) {
            $mins = ((int)round($f * 1440)) % 1440;
            return sprintf('%02d:%02d', (int)floor($mins / 60), $mins % 60);
        }
    }
    $m = array();
    if (preg_match('/(\d{1,2}):(\d{2})/', $s, $m)) {
        $h = (int)$m[1];
        $mi = (int)$m[2];
        if ($h > 23 || $mi > 59) return null;
        return sprintf('%02d:%02d', $h, $mi);
    }
    return null;
}

/* 兼容旧版前端解析器：把 workDate / emp_no / staffName 等别名归一为 date / empNo / name */
function attendance_import_row($row)
{
    if (!is_array($row)) return array();
    if ((!isset($row['date']) || $row['date'] === '') && isset($row['workDate'])) $row['date'] = $row['workDate'];
    if ((!isset($row['date']) || $row['date'] === '') && isset($row['work_date'])) $row['date'] = $row['work_date'];
    if ((!isset($row['date']) || $row['date'] === '') && isset($row['rawDate'])) $row['date'] = $row['rawDate'];
    if ((!isset($row['empNo']) || $row['empNo'] === '') && isset($row['emp_no'])) $row['empNo'] = $row['emp_no'];
    if ((!isset($row['name']) || $row['name'] === '') && isset($row['staffName'])) $row['name'] = $row['staffName'];
    if ((!isset($row['name']) || $row['name'] === '') && isset($row['staff_name'])) $row['name'] = $row['staff_name'];
    return $row;
}

/* 输出原始值的可读表示，便于在未匹配清单里定位“日期无效”的真实内容 */
function attendance_raw_repr($v)
{
    if (is_array($v)) return 'Array:' . json_encode($v, JSON_UNESCAPED_UNICODE);
    if (is_object($v)) return 'Object:' . json_encode($v, JSON_UNESCAPED_UNICODE);
    if (is_bool($v)) return $v ? 'true' : 'false';
    if ($v === null) return 'null';
    return '"' . (string)$v . '"';
}

/* 比对前规范化：去 BOM、零宽字符、全角空格、NBSP，收敛空白并去首尾空格 */
function attendance_clean_key($v)
{
    $s = (string)$v;
    $s = preg_replace('/[\x{FEFF}\x{200B}-\x{200D}\x{2060}]/u', '', $s);
    $s = str_replace(array("\xC2\xA0", "\xE3\x80\x80"), ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

/* 工号相近（长度相同且至多 2 位不同），用于提示报表与档案工号疑似录错 */
function attendance_near_emp($emp, $byEmp)
{
    foreach ($byEmp as $k => $staff) {
        if ($k === $emp || strlen($k) !== strlen($emp)) continue;
        $diff = 0;
        $len = strlen($k);
        for ($i = 0; $i < $len; $i++) {
            if ($k[$i] !== $emp[$i]) { $diff++; if ($diff > 2) break; }
        }
        if ($diff > 0 && $diff <= 2) {
            return array('no' => (string)$staff['emp_no'], 'name' => (string)$staff['name']);
        }
    }
    return null;
}

function attendance_daily_staff_index(){
    $byFeishu = array();
    $byEmp = array();
    $byName = array();
    $noName = array();
    foreach (db()->query('SELECT id, name, emp_no, feishu_emp_no, status FROM staff')->fetchAll() as $s) {
        $fsNo = strtoupper(attendance_clean_key($s['feishu_emp_no']));
        if ($fsNo !== '') $byFeishu[$fsNo] = $s;
        $no = strtoupper(attendance_clean_key($s['emp_no']));
        if ($no !== '') $byEmp[$no] = $s;
        $name = attendance_clean_key($s['name']);
        if ($name !== '') {
            if (!isset($byName[$name])) $byName[$name] = array();
            $byName[$name][] = $s;
        } else {
            $noName[] = (string)$s['emp_no'];
        }
    }
    return array($byFeishu, $byEmp, $byName, $noName);
}

function attendance_daily_match($row, $byFeishu, $byEmp, $byName)
{
    $empRaw = attendance_clean_key(isset($row['empNo']) ? $row['empNo'] : '');
    $emp = strtoupper($empRaw);
    if ($emp !== '' && isset($byFeishu[$emp])) {
        return array('staff' => $byFeishu[$emp], 'source' => 'feishu');
    }
    if ($emp !== '' && isset($byEmp[$emp])) {
        return array('staff' => $byEmp[$emp], 'source' => 'empNo');
    }
    $name = attendance_clean_key(isset($row['name']) ? $row['name'] : '');
    $list = ($name !== '' && isset($byName[$name])) ? $byName[$name] : array();
    if (count($list) === 1) return array('staff' => $list[0], 'source' => 'name');
    if (count($list) > 1) {
        $active = array();
        foreach ($list as $s) {
            if ($s['status'] === 'active') $active[] = $s;
        }
        if (count($active) === 1) return array('staff' => $active[0], 'source' => 'name');
        return array(
            'type' => 'nameDup',
            'reason' => '姓名重复：同名的 ' . count($list) . ' 人（在职 ' . count($active) . ' 人）无法唯一匹配'
        );
    }
    if ($emp !== '') {
        $near = attendance_near_emp($emp, $byEmp);
        return array(
            'type' => 'empMismatch',
            'near' => $near,
            'reason' => $near
                ? '工号不符：报表 ' . $empRaw . '，档案中相近工号 ' . $near['no'] . '（' . $near['name'] . '）'
                : '工号不符：报表 ' . $empRaw . ' 在档案中不存在'
        );
    }
    return array('type' => 'notFound', 'reason' => '库中无此人：工号与姓名均为空或未找到');
}

function attendance_daily_out($r)
{
    return array(
        'id' => $r['id'],
        'staffId' => $r['staff_id'],
        'staffName' => $r['staff_name'],
        'empNo' => $r['emp_no'],
        'workDate' => $r['work_date'],
        'segmentNo' => (int)$r['segment_no'],
        'storeCode' => $r['store_code'],
        'storeName' => $r['store_name'],
        'position' => $r['position'],
        'employmentType' => $r['employment_type'],
        'scheduleType' => $r['schedule_type'],
        'plannedIn' => attendance_daily_time($r['planned_in']),
        'plannedOut' => attendance_daily_time($r['planned_out']),
        'plannedHours' => (float)$r['planned_hours'],
        'mealHours' => (float)$r['meal_hours'],
        'plannedWorkHours' => (float)$r['planned_work_hours'],
        'clockIn' => attendance_daily_time($r['clock_in']),
        'clockOut' => attendance_daily_time($r['clock_out']),
        'confirmIn' => attendance_daily_time($r['confirm_in']),
        'confirmOut' => attendance_daily_time($r['confirm_out']),
        'confirmMealHours' => (float)$r['confirm_meal_hours'],
        'actualHours' => (float)$r['actual_hours'],
        'hourDiff' => (float)$r['hour_diff'],
        'managerConfirm' => $r['manager_confirm'],
        'employeeConfirm' => $r['employee_confirm']
    );
}

/* 员工端：仅返回当前登录员工本人的考勤明细 */
function api_attendance_my($in)
{
    $acc = require_login();
    $month = in_str($in, 'month', 7);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) $month = date('Y-m');
    $st = db()->prepare('SELECT * FROM attendance_daily WHERE staff_id = ? AND work_date LIKE ? ORDER BY work_date DESC, segment_no ASC');
    $st->execute(array($acc['staff_id'], $month . '-%'));
    $days = array();
    foreach ($st->fetchAll() as $r) {
        $date = $r['work_date'];
        if (!isset($days[$date])) {
            $days[$date] = array('date' => $date, 'totalHours' => 0, 'abnormal' => false, 'segments' => array());
        }
        $diff = attendance_daily_round2($r['hour_diff']);
        $tags = array();
        if (abs($diff) > 0.001) {
            $tags[] = array('text' => '工时差异 ' . ($diff > 0 ? '+' : '') . $diff . ' 小时', 'cls' => $diff > 0 ? 'warn' : 'danger');
        }
        if ($r['manager_confirm'] !== '' && $r['manager_confirm'] !== '已确认') {
            $tags[] = array('text' => '店长未确认', 'cls' => 'warn');
        }
        if ($r['employee_confirm'] !== '' && $r['employee_confirm'] !== '已确认') {
            $tags[] = array('text' => '员工未确认', 'cls' => 'warn');
        }
        $days[$date]['totalHours'] = attendance_daily_round2($days[$date]['totalHours'] + (float)$r['actual_hours']);
        if (count($tags)) $days[$date]['abnormal'] = true;
        $seg = attendance_daily_out($r);
        $seg['tags'] = $tags;
        $days[$date]['segments'][] = $seg;
    }
    krsort($days);
    $list = array();
    $totalHours = 0;
    $abnormal = 0;
    foreach ($days as $d) {
        usort($d['segments'], function ($a, $b) { return $a['segmentNo'] - $b['segmentNo']; });
        $totalHours = attendance_daily_round2($totalHours + $d['totalHours']);
        foreach ($d['segments'] as $s) {
            if (count($s['tags'])) $abnormal++;
        }
        $list[] = $d;
    }
    return array(
        'month' => $month,
        'summary' => array('workDays' => count($list), 'totalHours' => $totalHours, 'abnormalCount' => $abnormal),
        'days' => $list
    );
}

/* 超管：导入考勤日报（dryRun=1 仅预览，不写库） */
function api_attendance_import($in)
{
    $acc = require_super();
    $rows = (isset($in['rows']) && is_array($in['rows'])) ? $in['rows'] : array();
    $dry = !empty($in['dryRun']);
    if (!$rows) throw new ApiException('文件里没有可导入的考勤记录');
    if (count($rows) > 5000) throw new ApiException('单次最多导入 5000 条考勤记录，请拆分文件');

    list($byFeishu, $byEmp, $byName, $noName) = attendance_daily_staff_index();

    $dates = array();
    foreach ($rows as $r) {
        $r = attendance_import_row($r);
        $d = attendance_norm_date(isset($r['date']) ? $r['date'] : '');
        if ($d !== '') $dates[] = $d;
    }
    sort($dates);
    $existing = array();
    if ($dates) {
        $st = db()->prepare('SELECT id FROM attendance_daily WHERE work_date BETWEEN ? AND ?');
        $st->execute(array($dates[0], $dates[count($dates) - 1]));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) $existing[(string)$id] = true;
    }

    $insertCols = array(
        'id', 'staff_id', 'work_date', 'segment_no', 'emp_no', 'staff_name', 'store_code', 'store_name',
        'position', 'employment_type', 'schedule_type', 'planned_in', 'planned_out', 'planned_hours',
        'meal_hours', 'planned_work_hours', 'clock_in', 'clock_out', 'confirm_in', 'confirm_out',
        'confirm_meal_hours', 'actual_hours', 'hour_diff', 'manager_confirm', 'employee_confirm',
        'imported_by', 'imported_at', 'created_at', 'updated_at'
    );
    $insertSql = 'INSERT INTO attendance_daily (' . implode(',', $insertCols) . ') VALUES (' . implode(',', array_fill(0, count($insertCols), '?')) . ')';
    $updateSql = 'UPDATE attendance_daily SET emp_no=?, staff_name=?, store_code=?, store_name=?, position=?, employment_type=?, schedule_type=?, planned_in=?, planned_out=?, planned_hours=?, meal_hours=?, planned_work_hours=?, clock_in=?, clock_out=?, confirm_in=?, confirm_out=?, confirm_meal_hours=?, actual_hours=?, hour_diff=?, manager_confirm=?, employee_confirm=?, imported_by=?, imported_at=?, updated_at=? WHERE id=?';

    $inserted = 0;
    $updated = 0;
    $failed = 0;
    $seen = array();
    $staffSet = array();
    $fileStaff = array();
    $matchedBy = array('feishu' => 0, 'empNo' => 0, 'name' => 0);
    $reasons = array('empMismatch' => 0, 'nameDup' => 0, 'notFound' => 0, 'invalidDate' => 0);
    $unmatched = array();
    $datesOk = array();

    if (!$dry) db()->beginTransaction();
    try {
        foreach ($rows as $raw) {
            $raw = attendance_import_row($raw);
            $date = attendance_norm_date(isset($raw['date']) ? $raw['date'] : '');
            if ($date === '') {
                $failed++;
                $reasons['invalidDate']++;
                $key = (isset($raw['empNo']) ? $raw['empNo'] : '') . '|' . (isset($raw['name']) ? $raw['name'] : '');
                if (!isset($unmatched[$key])) {
                    $unmatched[$key] = array(
                        'empNo' => isset($raw['empNo']) ? (string)$raw['empNo'] : '',
                        'name' => isset($raw['name']) ? (string)$raw['name'] : '',
                        'rows' => 0,
                        'reason' => '日期无效：' . attendance_raw_repr(isset($raw['date']) ? $raw['date'] : null),
                        'type' => 'invalidDate',
                        'near' => null
                    );
                } else {
                    $rr = '日期无效：' . attendance_raw_repr(isset($raw['date']) ? $raw['date'] : null);
                    if (strpos($unmatched[$key]['reason'], $rr) === false) $unmatched[$key]['reason'] .= '；' . $rr;
                }
                $unmatched[$key]['rows']++;
                continue;
            }
            $fileStaff[(isset($raw['empNo']) ? $raw['empNo'] : '') . '|' . (isset($raw['name']) ? $raw['name'] : '')] = true;
            $datesOk[] = $date;
            $hit = attendance_daily_match($raw, $byFeishu, $byEmp, $byName);
            if (empty($hit['staff'])) {
                $failed++;
                $type = isset($hit['type']) ? $hit['type'] : 'notFound';
                if (!isset($reasons[$type])) $reasons[$type] = 0;
                $reasons[$type]++;
                $key = (isset($raw['empNo']) ? $raw['empNo'] : '') . '|' . (isset($raw['name']) ? $raw['name'] : '');
                if (!isset($unmatched[$key])) {
                    $unmatched[$key] = array(
                        'empNo' => isset($raw['empNo']) ? (string)$raw['empNo'] : '',
                        'name' => isset($raw['name']) ? (string)$raw['name'] : '',
                        'rows' => 0,
                        'reason' => isset($hit['reason']) ? $hit['reason'] : '未匹配到员工',
                        'type' => $type,
                        'near' => isset($hit['near']) ? $hit['near'] : null
                    );
                } else if (!empty($hit['reason']) && strpos($unmatched[$key]['reason'], $hit['reason']) === false) {
                    $unmatched[$key]['reason'] .= '；' . $hit['reason'];
                }
                $unmatched[$key]['rows']++;
                continue;
            }
            $staff = $hit['staff'];
            if (!empty($hit['source']) && isset($matchedBy[$hit['source']])) $matchedBy[$hit['source']]++;
            $seg = (int)(isset($raw['segmentNo']) ? $raw['segmentNo'] : 1);
            if ($seg < 1) $seg = 1;
            $id = $staff['id'] . '-' . $date . '-' . $seg;

            $vals = array(
                $id, $staff['id'], $date, $seg,
                isset($raw['empNo']) && $raw['empNo'] !== '' ? (string)$raw['empNo'] : (string)$staff['emp_no'],
                $staff['name'],
                isset($raw['storeCode']) ? (string)$raw['storeCode'] : '',
                isset($raw['storeName']) ? (string)$raw['storeName'] : '',
                isset($raw['position']) ? (string)$raw['position'] : '',
                isset($raw['employmentType']) ? (string)$raw['employmentType'] : '',
                isset($raw['scheduleType']) ? (string)$raw['scheduleType'] : '',
                attendance_norm_time(isset($raw['plannedIn']) ? $raw['plannedIn'] : ''),
                attendance_norm_time(isset($raw['plannedOut']) ? $raw['plannedOut'] : ''),
                attendance_daily_round2(isset($raw['plannedHours']) ? $raw['plannedHours'] : 0),
                attendance_daily_round2(isset($raw['mealHours']) ? $raw['mealHours'] : 0),
                attendance_daily_round2(isset($raw['plannedWorkHours']) ? $raw['plannedWorkHours'] : 0),
                attendance_norm_time(isset($raw['clockIn']) ? $raw['clockIn'] : ''),
                attendance_norm_time(isset($raw['clockOut']) ? $raw['clockOut'] : ''),
                attendance_norm_time(isset($raw['confirmIn']) ? $raw['confirmIn'] : ''),
                attendance_norm_time(isset($raw['confirmOut']) ? $raw['confirmOut'] : ''),
                attendance_daily_round2(isset($raw['confirmMealHours']) ? $raw['confirmMealHours'] : 0),
                attendance_daily_round2(isset($raw['actualHours']) ? $raw['actualHours'] : 0),
                attendance_daily_round2(isset($raw['hourDiff']) ? $raw['hourDiff'] : 0),
                isset($raw['managerConfirm']) ? (string)$raw['managerConfirm'] : '',
                isset($raw['employeeConfirm']) ? (string)$raw['employeeConfirm'] : ''
            );

            if ($dry) {
                if (isset($existing[$id]) || isset($seen[$id])) $updated++; else { $inserted++; $seen[$id] = true; }
            } else {
                $now = now_dt();
                if (isset($existing[$id])) {
                    $updVals = array_slice($vals, 4); /* 从 emp_no 开始 */
                    $updVals[] = $acc['name'];
                    $updVals[] = $now;
                    $updVals[] = $now;
                    $updVals[] = $id;
                    $st = db()->prepare($updateSql);
                    $st->execute($updVals);
                    $updated++;
                } else {
                    $vals[] = $acc['name'];
                    $vals[] = $now;
                    $vals[] = $now;
                    $vals[] = $now;
                    $st = db()->prepare($insertSql);
                    $st->execute($vals);
                    $inserted++;
                    $existing[$id] = true;
                }
            }
            $staffSet[$staff['id']] = true;
        }
        if (!$dry) db()->commit();
    } catch (Exception $e) {
        if (!$dry) db()->rollBack();
        throw $e;
    }

    sort($datesOk);
    $stats = array(
        'dryRun' => $dry,
        'recordCount' => count($rows),
        'matchedCount' => $inserted + $updated,
        'inserted' => $inserted,
        'updated' => $updated,
        'failed' => $failed,
        'staffCount' => count($fileStaff),
        'matchedStaffCount' => count($staffSet),
        'matchedBy' => $matchedBy,
        'index' => array(
            'feishu' => count($byFeishu),
            'empNo' => count($byEmp),
            'name' => count($byName),
            'emptyName' => count($noName),
            'emptyNameEmpNos' => array_slice($noName, 0, 10)
        ),
        'reasons' => $reasons,
        'near' => array_values(array_filter($unmatched, function ($x) { return !empty($x['near']); })),
        'dateFrom' => count($datesOk) ? $datesOk[0] : '',
        'dateTo' => count($datesOk) ? $datesOk[count($datesOk) - 1] : '',
        'unmatched' => array_values($unmatched)
    );
    if (!$dry) {
        audit_log('导入考勤日报', $stats['dateFrom'] ? $stats['dateFrom'] . ' 至 ' . $stats['dateTo'] : '考勤日报',
            '新增 ' . $inserted . ' 条，覆盖 ' . $updated . ' 条，失败 ' . $failed . ' 条，未匹配 ' . count($unmatched) . ' 人');
    }
    return $stats;
}
