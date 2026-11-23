<?php
/* salary_actions.php — 薪资录入、发布、撤回与员工端查询 */

function salary_income_fields()
{
    return array(
        'baseSalary' => '基本工资', 'postAllowance' => '岗位/技能津贴', 'performancePay' => '实发绩效工资',
        'fullAttendance' => '全勤奖', 'dailyOvertimePay' => '日常加班工资', 'statutoryHolidayPay' => '法定三薪',
        'mealSubsidy' => '餐费补贴', 'transportSubsidy' => '交通补贴', 'attendanceSubsidy' => '出勤补贴',
        'socialSubsidy' => '社保补贴', 'commission' => '提成'
    );
}

function salary_deduction_fields()
{
    return array(
        'inventoryDeduction' => '盘点扣款', 'lateDeduction' => '迟到扣款', 'attendanceDiff' => '出勤差额',
        'leaveDeduction' => '事假/病假扣款', 'disciplineDeduction' => '违纪扣款',
        'otherDeduction' => '其他扣款', 'insurance' => '社保/公积金个人部分', 'tax' => '个人所得税'
    );
}

function salary_column_map()
{
    return array(
        'baseSalary' => 'base_salary', 'postAllowance' => 'post_allowance', 'performancePay' => 'performance_pay',
        'fullAttendance' => 'full_attendance', 'dailyOvertimePay' => 'daily_overtime_pay',
        'statutoryHolidayPay' => 'statutory_holiday_pay', 'mealSubsidy' => 'meal_subsidy',
        'transportSubsidy' => 'transport_subsidy', 'attendanceSubsidy' => 'attendance_subsidy',
        'socialSubsidy' => 'social_subsidy', 'commission' => 'commission',
        'inventoryDeduction' => 'inventory_deduction', 'lateDeduction' => 'late_deduction',
        'attendanceDiff' => 'attendance_diff', 'leaveDeduction' => 'leave_deduction',
        'disciplineDeduction' => 'discipline_deduction', 'otherDeduction' => 'other_deduction',
        'insurance' => 'insurance', 'tax' => 'tax'
    );
}

function salary_amounts($in)
{
    $out = array();
    $fields = salary_income_fields() + salary_deduction_fields();
    foreach ($fields as $key => $label) {
        $raw = isset($in[$key]) ? $in[$key] : '';
        if ($raw === '' || $raw === null) {
            $out[$key] = 0.0;
            continue;
        }
        if (is_array($raw)) throw new ApiException($label . '：金额格式不正确');
        $s = trim((string)$raw);
        if (!preg_match('/^\d+(\.\d{1,2})?$/', $s) || (float)$s > 999999.99) {
            throw new ApiException($label . '：金额需为不小于 0 的数字，最多两位小数');
        }
        $out[$key] = (float)$s;
    }
    return $out;
}

function salary_row($staffId, $month)
{
    $st = db()->prepare('SELECT * FROM salaries WHERE staff_id = ? AND month = ?');
    $st->execute(array($staffId, $month));
    $row = $st->fetch();
    return $row ? $row : null;
}

function api_salary_get($in)
{
    $acc = require_login();
    $month = in_str($in, 'month', 7);
    $row = salary_row($acc['staff_id'], $month);
    if (!$row) return null;
    if ($row['pay_status'] !== 'published' && $row['pay_status'] !== 'paid') return null;
    if ((int)$row['hidden'] === 1) return null;
    return salary_out($row);
}

function api_salary_my_months($in)
{
    $acc = require_login();
    $st = db()->prepare("SELECT month FROM salaries WHERE staff_id = ? AND pay_status IN ('published','paid') ORDER BY month DESC");
    $st->execute(array($acc['staff_id']));
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

function api_salary_list($in)
{
    require_admin();
    $month = in_str($in, 'month', 7);
    $rows = active_staff_rows();
    $list = array();
    foreach ($rows as $s) {
        $list[] = array(
            'staff' => array(
                'id' => $s['id'], 'name' => $s['name'],
                'nickname' => isset($s['nickname']) ? $s['nickname'] : '',
                'avatar' => isset($s['avatar']) ? $s['avatar'] : '',
                'displayName' => display_name($s['name'], isset($s['nickname']) ? $s['nickname'] : ''),
                'position' => normalize_position($s['position']), 'employmentType' => $s['employment_type'], 'empNo' => $s['emp_no'] ? $s['emp_no'] : '', 'feishuEmpNo' => isset($s['feishu_emp_no']) ? $s['feishu_emp_no'] : ''
            ),
            'salary' => salary_out(salary_row($s['id'], $month))
        );
    }
    return array('month' => $month, 'list' => $list, 'total' => count($list));
}

function api_salary_save($in)
{
    $acc = require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $staff = staff_by_id($staffId);
    if (!$staff) throw new ApiException('档案不存在', 'NOT_FOUND', 404);
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) throw new ApiException('月份格式不正确');

    $amounts = salary_amounts($in);
    $disciplineReason = in_str($in, 'disciplineReason', 255);
    $otherReason = in_str($in, 'otherReason', 255);
    if ($amounts['disciplineDeduction'] > 0 && $disciplineReason === '') throw new ApiException('该扣款需填写事由后才能保存（违纪扣款）');
    if ($amounts['otherDeduction'] > 0 && $otherReason === '') throw new ApiException('该扣款需填写事由后才能保存（其他扣款）');

    $actualRaw = isset($in['actualDays']) ? $in['actualDays'] : '';
    $actualDays = null;
    if ($actualRaw !== '' && $actualRaw !== null) {
        if (!is_numeric($actualRaw) || (float)$actualRaw < 0 || (float)$actualRaw > 31) throw new ApiException('出勤天数需为 0—31 之间的数字');
        $actualDays = round((float)$actualRaw, 1);
    }
    $shouldDays = in_num($in, 'shouldDays', 26);
    if ($shouldDays < 0 || $shouldDays > 31) $shouldDays = 26;
    $totalRaw = isset($in['totalHours']) ? $in['totalHours'] : '';
    if ($totalRaw !== '' && $totalRaw !== null && !is_numeric($totalRaw)) throw new ApiException('总工时需为 0—744 之间的数字');
    $totalHours = ($totalRaw === '' || $totalRaw === null) ? 0 : (float)$totalRaw;
    if ($totalHours < 0 || $totalHours > 744) throw new ApiException('总工时需为 0—744 之间的数字');

    $computed = calc_salary($amounts);
    $data = array(
        'should_days' => $shouldDays,
        'actual_days' => $actualDays,
        'total_hours' => round($totalHours, 2),
        'base_salary' => $amounts['baseSalary'],
        'post_allowance' => $amounts['postAllowance'],
        'performance_pay' => $amounts['performancePay'],
        'full_attendance' => $amounts['fullAttendance'],
        'daily_overtime_pay' => $amounts['dailyOvertimePay'],
        'statutory_holiday_pay' => $amounts['statutoryHolidayPay'],
        'meal_subsidy' => $amounts['mealSubsidy'],
        'transport_subsidy' => $amounts['transportSubsidy'],
        'attendance_subsidy' => $amounts['attendanceSubsidy'],
        'social_subsidy' => $amounts['socialSubsidy'],
        'commission' => $amounts['commission'],
        'gross_pay' => $computed['grossPay'],
        'inventory_deduction' => $amounts['inventoryDeduction'],
        'late_deduction' => $amounts['lateDeduction'],
        'attendance_diff' => $amounts['attendanceDiff'],
        'leave_deduction' => $amounts['leaveDeduction'],
        'discipline_deduction' => $amounts['disciplineDeduction'],
        'discipline_reason' => $disciplineReason,
        'other_deduction' => $amounts['otherDeduction'],
        'other_reason' => $otherReason,
        'insurance' => $amounts['insurance'],
        'tax' => $amounts['tax'],
        'deduction_total' => $computed['deductionTotal'],
        'net_pay' => $computed['netPay'],
        'remark' => in_str($in, 'remark', 255),
        'updated_by' => $acc['name'],
        'updated_at' => now_dt()
    );

    $existing = salary_row($staffId, $month);
    if ($existing) {
        $sets = array();
        $args = array();
        foreach ($data as $col => $val) {
            $sets[] = $col . ' = ?';
            $args[] = $val;
        }
        $args[] = $existing['id'];
        $st = db()->prepare('UPDATE salaries SET ' . implode(', ', $sets) . ' WHERE id = ?');
        $st->execute($args);
        if ($existing['pay_status'] === 'published' || $existing['pay_status'] === 'paid') {
            audit_log('修改已发布薪资', $staff['name'], $month . ' 修改金额并记录');
        }
    } else {
        $status = in_str($in, 'payStatus', 12, 'draft');
        if (!in_array($status, array('draft', 'published', 'paid'), true)) $status = 'draft';
        $payDate = in_str($in, 'payDate', 10);
        $cols = array('id', 'staff_id', 'month');
        $vals = array($staffId . '-' . $month, $staffId, $month);
        foreach ($data as $col => $val) {
            $cols[] = $col;
            $vals[] = $val;
        }
        $cols[] = 'pay_status';
        $vals[] = $status;
        $cols[] = 'pay_date';
        $vals[] = $payDate !== '' ? $payDate : null;
        $cols[] = 'publish_at';
        $vals[] = ($status === 'published' || $status === 'paid') ? now_dt() : null;
        $cols[] = 'published_by';
        $vals[] = ($status === 'published' || $status === 'paid') ? $acc['name'] : '';
        $cols[] = 'hidden';
        $vals[] = 0;
        $marks = implode(',', array_fill(0, count($cols), '?'));
        $st = db()->prepare('INSERT INTO salaries (' . implode(',', $cols) . ') VALUES (' . $marks . ')');
        $st->execute($vals);
    }
    return array('ok' => true, 'grossPay' => $computed['grossPay'], 'deductionTotal' => $computed['deductionTotal'], 'netPay' => $computed['netPay']);
}

function api_salary_delete_draft($in)
{
    require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $row = salary_row($staffId, $month);
    if (!$row) return array('ok' => true);
    if ($row['pay_status'] !== 'draft') throw new ApiException('已发布的薪资不可删除，请先撤回');
    $st = db()->prepare('DELETE FROM salaries WHERE id = ?');
    $st->execute(array($row['id']));
    return array('ok' => true);
}

function api_salary_publish($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $rows = active_staff_rows();
    $missing = array();
    foreach ($rows as $s) {
        $x = salary_row($s['id'], $month);
        /* 完整性校验只拦「没记录 / 必填字段为空」，0 是合法值（未上班月份全 0 也可发布） */
        if (!$x || $x['total_hours'] === null || $x['gross_pay'] === null || $x['actual_days'] === null) {
            $missing[] = $s['name'];
        }
    }
    if ($missing) {
        throw new ApiException('还有 ' . count($missing) . ' 人未填写完整，暂不能发布，请补齐后再发布', 'SALARY_INCOMPLETE', 400, array('missing' => $missing));
    }
    $count = 0;
    foreach ($rows as $s) {
        $x = salary_row($s['id'], $month);
        if (!$x) continue;
        if ($x['pay_status'] !== 'published' && $x['pay_status'] !== 'paid') {
            $st = db()->prepare("UPDATE salaries SET pay_status='published', publish_at=?, published_by=?, updated_at=? WHERE id=?");
            $st->execute(array(now_dt(), $acc['name'], now_dt(), $x['id']));
        }
        $count++;
    }
    audit_log('发布薪资', $month, '共 ' . $count . ' 人');
    return array('ok' => true, 'count' => $count);
}

function api_salary_withdraw($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $st = db()->prepare("SELECT * FROM salaries WHERE month = ? AND pay_status = 'published'");
    $st->execute(array($month));
    $rows = $st->fetchAll();
    if (!$rows) throw new ApiException('该月没有已发布的薪资');
    foreach ($rows as $x) {
        $pubDate = $x['publish_at'] ? substr($x['publish_at'], 0, 10) : '';
        if ($pubDate !== today_d() && $acc['role'] !== 'superadmin') {
            throw new ApiException('仅发布当天可撤回，' . $month . ' 的薪资已超过可撤回时间，请联系店长处理');
        }
    }
    $st = db()->prepare("UPDATE salaries SET pay_status='draft', publish_at=NULL, updated_at=? WHERE month=? AND pay_status='published'");
    $st->execute(array(now_dt(), $month));
    audit_log('撤回薪资', $month, '撤回 ' . count($rows) . ' 人');
    return array('ok' => true, 'count' => count($rows));
}

function api_salary_mark_paid($in)
{
    require_admin();
    $staffId = in_str($in, 'staffId', 16);
    $month = in_str($in, 'month', 7);
    $row = salary_row($staffId, $month);
    if (!$row) throw new ApiException('请先保存该员工薪资');
    if ($row['pay_status'] !== 'published') throw new ApiException('请先发布薪资');
    $payDate = in_str($in, 'payDate', 10);
    if ($payDate === '') $payDate = today_d();
    $st = db()->prepare("UPDATE salaries SET pay_status='paid', pay_date=?, updated_at=? WHERE id=?");
    $st->execute(array($payDate, now_dt(), $row['id']));
    $staff = staff_by_id($staffId);
    audit_log('登记发放', $staff ? $staff['name'] : '', $month . ' 发放日期 ' . $payDate);
    return array('ok' => true);
}

function salary_copy_columns()
{
    return array(
        'should_days', 'actual_days', 'total_hours', 'base_salary', 'post_allowance', 'performance_pay',
        'full_attendance', 'daily_overtime_pay', 'statutory_holiday_pay', 'meal_subsidy', 'transport_subsidy',
        'attendance_subsidy', 'social_subsidy', 'commission', 'gross_pay', 'inventory_deduction',
        'late_deduction', 'attendance_diff', 'leave_deduction', 'discipline_deduction', 'discipline_reason',
        'other_deduction', 'other_reason', 'insurance', 'tax', 'deduction_total', 'net_pay'
    );
}

/* ---------- 工资明细报表导入 ---------- */
/* 月份正则：同样改用 ~ 作分隔符，避免字符类里的 / 提前结束模式导致恒不匹配 */
function salary_month_pattern()
{
    return '~^(\d{4})\s*[-/.年]?\s*(\d{1,2})\s*月?$~u';
}

function salary_import_month_trace($v)
{
    $t = array('raw' => $v, 'trimmed' => '', 'normalized' => '', 'regex_ok' => false, 'regex_match' => array(), 'result' => '');
    $s = trim((string)$v);
    $t['trimmed'] = $s;
    if ($s === '') return $t;
    $s = strtr($s, array('０' => '0', '１' => '1', '２' => '2', '３' => '3', '４' => '4', '５' => '5', '６' => '6', '７' => '7', '８' => '8', '９' => '9', "\xE3\x80\x80" => ' '));
    $t['normalized'] = $s;
    $m = array();
    $ok = preg_match(salary_month_pattern(), $s, $m);
    $t['regex_ok'] = (bool)$ok;
    $t['regex_match'] = $m;
    if ($ok) {
        $mo = (int)$m[2];
        if ($mo >= 1 && $mo <= 12) $t['result'] = $m[1] . '-' . sprintf('%02d', $mo);
    }
    return $t;
}

function salary_import_month($v)
{
    $t = salary_import_month_trace($v);
    return $t['result'];
}

/* 原始值可读表示，用于“月份无效”定位 */
function salary_raw_repr($v)
{
    if (is_array($v) || is_object($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
    if ($v === null) return 'null';
    return '"' . (string)$v . '"';
}

/* 兼容旧版前端解析器：把 salaryMonth / emp_no / staffName 等别名归一为 month / empNo / name */
function salary_import_row($row)
{
    if (!is_array($row)) return array();
    if ((!isset($row['month']) || $row['month'] === '') && isset($row['salaryMonth'])) $row['month'] = $row['salaryMonth'];
    if ((!isset($row['month']) || $row['month'] === '') && isset($row['salary_month'])) $row['month'] = $row['salary_month'];
    if ((!isset($row['month']) || $row['month'] === '') && isset($row['rawMonth'])) $row['month'] = $row['rawMonth'];
    if ((!isset($row['empNo']) || $row['empNo'] === '') && isset($row['emp_no'])) $row['empNo'] = $row['emp_no'];
    if ((!isset($row['name']) || $row['name'] === '') && isset($row['staffName'])) $row['name'] = $row['staffName'];
    if ((!isset($row['name']) || $row['name'] === '') && isset($row['staff_name'])) $row['name'] = $row['staff_name'];
    return $row;
}

/* 比对前规范化：去 BOM、零宽字符、全角空格、NBSP，收敛空白并去首尾空格 */
function salary_clean_key($v)
{
    $s = (string)$v;
    $s = preg_replace('/[\x{FEFF}\x{200B}-\x{200D}\x{2060}]/u', '', $s);
    $s = str_replace(array("\xC2\xA0", "\xE3\x80\x80"), ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    return trim($s);
}

function salary_near_emp($emp, $byEmp)
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

function salary_import_index()
{
    $byFeishu = array();
    $byEmp = array();
    $byName = array();
    foreach (db()->query('SELECT id, name, emp_no, feishu_emp_no, status FROM staff')->fetchAll() as $s) {
        $fsNo = strtoupper(salary_clean_key($s['feishu_emp_no']));
        if ($fsNo !== '') $byFeishu[$fsNo] = $s;
        $no = strtoupper(salary_clean_key($s['emp_no']));
        if ($no !== '') $byEmp[$no] = $s;
        $name = salary_clean_key($s['name']);
        if ($name !== '') {
            if (!isset($byName[$name])) $byName[$name] = array();
            $byName[$name][] = $s;
        }
    }
    return array($byFeishu, $byEmp, $byName);
}

function salary_import_match($row, $byFeishu, $byEmp, $byName)
{
    $empRaw = salary_clean_key(isset($row['empNo']) ? $row['empNo'] : '');
    $emp = strtoupper($empRaw);
    if ($emp !== '' && isset($byFeishu[$emp])) return array('staff' => $byFeishu[$emp], 'source' => 'feishu');
    if ($emp !== '' && isset($byEmp[$emp])) return array('staff' => $byEmp[$emp], 'source' => 'empNo');
    $name = salary_clean_key(isset($row['name']) ? $row['name'] : '');
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
        $near = salary_near_emp($emp, $byEmp);
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

function salary_import_amount($row, $key)
{
    $v = isset($row[$key]) ? $row[$key] : '';
    if ($v === '' || $v === null) return 0.0;
    if (!is_numeric($v)) throw new ApiException('薪资金额格式不正确');
    $f = round((float)$v, 2);
    if ($f < 0 || $f > 999999.99) throw new ApiException('薪资金额超出允许范围');
    return $f;
}

/* 已导入考勤明细的打卡天数；表不存在时返回 -1，表示不更新实际出勤天数 */
function salary_attendance_days($staffId, $month)
{
    try {
        $st = db()->prepare('SELECT COUNT(DISTINCT work_date) FROM attendance_daily WHERE staff_id = ? AND work_date LIKE ?');
        $st->execute(array($staffId, $month . '-%'));
        return (int)$st->fetchColumn();
    } catch (Exception $e) {
        return -1;
    }
}

function api_salary_import($in)
{
    $acc = require_super();
    $rows = (isset($in['rows']) && is_array($in['rows'])) ? $in['rows'] : array();
    $dry = !empty($in['dryRun']);
    if (!$rows) throw new ApiException('文件里没有可导入的薪资记录');
    if (count($rows) > 2000) throw new ApiException('单次最多导入 2000 条薪资记录，请拆分文件');

    list($byFeishu, $byEmp, $byName) = salary_import_index();
    $months = array();
    foreach ($rows as $r) {
        $r = salary_import_row($r);
        $m = salary_import_month(isset($r['month']) ? $r['month'] : '');
        if ($m !== '') $months[$m] = true;
    }
    $existing = array();
    if ($months) {
        $marks = implode(',', array_fill(0, count($months), '?'));
        $st = db()->prepare('SELECT id FROM salaries WHERE month IN (' . $marks . ')');
        $st->execute(array_keys($months));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) $existing[(string)$id] = true;
    }

    $amountCols = array(
        'base_salary' => 'baseSalary', 'post_allowance' => 'postAllowance', 'performance_pay' => 'performancePay',
        'full_attendance' => 'fullAttendance', 'daily_overtime_pay' => 'dailyOvertimePay',
        'statutory_holiday_pay' => 'statutoryHolidayPay', 'meal_subsidy' => 'mealSubsidy',
        'transport_subsidy' => 'transportSubsidy', 'attendance_subsidy' => 'attendanceSubsidy',
        'social_subsidy' => 'socialSubsidy', 'commission' => 'commission',
        'inventory_deduction' => 'inventoryDeduction', 'late_deduction' => 'lateDeduction',
        'attendance_diff' => 'attendanceDiff', 'leave_deduction' => 'leaveDeduction',
        'discipline_deduction' => 'disciplineDeduction', 'other_deduction' => 'otherDeduction',
        'insurance' => 'insurance', 'tax' => 'tax'
    );

    $inserted = 0;
    $updated = 0;
    $failed = 0;
    $mismatch = 0;
    $staffSet = array();
    $fileStaff = array();
    $matchedBy = array('feishu' => 0, 'empNo' => 0, 'name' => 0);
    $reasons = array('empMismatch' => 0, 'nameDup' => 0, 'notFound' => 0, 'invalidMonth' => 0);
    $unmatched = array();

    if (!$dry) db()->beginTransaction();
    try {
        foreach ($rows as $raw) {
            $raw = salary_import_row($raw);
            $month = salary_import_month(isset($raw['month']) ? $raw['month'] : '');
            if ($month === '') {
                $failed++;
                $reasons['invalidMonth']++;
                $key = (isset($raw['empNo']) ? $raw['empNo'] : '') . '|' . (isset($raw['name']) ? $raw['name'] : '');
                if (!isset($unmatched[$key])) {
                    $unmatched[$key] = array(
                        'empNo' => isset($raw['empNo']) ? (string)$raw['empNo'] : '',
                        'name' => isset($raw['name']) ? (string)$raw['name'] : '',
                        'rows' => 0,
                        'reason' => '月份无效：' . salary_raw_repr(isset($raw['month']) ? $raw['month'] : null),
                        'type' => 'invalidMonth',
                        'near' => null
                    );
                } else {
                    $rr = '月份无效：' . salary_raw_repr(isset($raw['month']) ? $raw['month'] : null);
                    if (strpos($unmatched[$key]['reason'], $rr) === false) $unmatched[$key]['reason'] .= '；' . $rr;
                }
                $unmatched[$key]['rows']++;
                continue;
            }
            $fileStaff[(isset($raw['empNo']) ? $raw['empNo'] : '') . '|' . (isset($raw['name']) ? $raw['name'] : '')] = true;
            $hit = salary_import_match($raw, $byFeishu, $byEmp, $byName);
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
                }
                $unmatched[$key]['rows']++;
                continue;
            }
            $staff = $hit['staff'];
            if (!empty($hit['source']) && isset($matchedBy[$hit['source']])) $matchedBy[$hit['source']]++;
            $amounts = array();
            try {
                foreach ($amountCols as $col => $jsKey) $amounts[$jsKey] = salary_import_amount($raw, $jsKey);
            } catch (Exception $e) {
                $failed++;
                continue;
            }
            $shouldDays = isset($raw['shouldDays']) ? (float)$raw['shouldDays'] : 26;
            if ($shouldDays <= 0 || $shouldDays > 31) $shouldDays = 26;
            $totalHours = isset($raw['totalHours']) ? round((float)$raw['totalHours'], 2) : 0;
            if ($totalHours < 0 || $totalHours > 744) $totalHours = 0;
            $computed = calc_salary($amounts);
            if (isset($raw['sourceNet']) && $raw['sourceNet'] !== '' && $raw['sourceNet'] !== null
                && abs($computed['netPay'] - (float)$raw['sourceNet']) > 0.01) {
                $mismatch++;
            }
            $id = $staff['id'] . '-' . $month;

            if ($dry) {
                if (isset($existing[$id])) $updated++; else $inserted++;
            } else {
                $days = salary_attendance_days($staff['id'], $month);
                $exists = salary_row($staff['id'], $month);
                if ($exists) {
                    $sets = array('should_days = ?', 'total_hours = ?');
                    $args = array(round($shouldDays, 1), $totalHours);
                    foreach ($amountCols as $col => $jsKey) {
                        $sets[] = $col . ' = ?';
                        $args[] = $amounts[$jsKey];
                    }
                    $sets[] = 'gross_pay = ?';
                    $args[] = $computed['grossPay'];
                    $sets[] = 'deduction_total = ?';
                    $args[] = $computed['deductionTotal'];
                    $sets[] = 'net_pay = ?';
                    $args[] = $computed['netPay'];
                    if ($days >= 0) {
                        $sets[] = 'actual_days = ?';
                        $args[] = $days;
                    }
                    $sets[] = 'updated_by = ?';
                    $args[] = $acc['name'];
                    $sets[] = 'updated_at = ?';
                    $args[] = now_dt();
                    $args[] = $exists['id'];
                    $st = db()->prepare('UPDATE salaries SET ' . implode(', ', $sets) . ' WHERE id = ?');
                    $st->execute($args);
                    $updated++;
                } else {
                    $cols = array('id', 'staff_id', 'month', 'should_days', 'total_hours');
                    $vals = array($id, $staff['id'], $month, round($shouldDays, 1), $totalHours);
                    foreach ($amountCols as $col => $jsKey) {
                        $cols[] = $col;
                        $vals[] = $amounts[$jsKey];
                    }
                    $cols = array_merge($cols, array('gross_pay', 'deduction_total', 'net_pay', 'actual_days', 'pay_status', 'pay_date', 'publish_at', 'published_by', 'hidden', 'remark', 'updated_by', 'updated_at'));
                    $vals = array_merge($vals, array(
                        $computed['grossPay'], $computed['deductionTotal'], $computed['netPay'],
                        $days > 0 ? $days : null, 'draft', null, null, '', 0, '由工资明细报表导入', $acc['name'], now_dt()
                    ));
                    $st = db()->prepare('INSERT INTO salaries (' . implode(',', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')');
                    $st->execute($vals);
                    $inserted++;
                }
            }
            $staffSet[$staff['id']] = true;
        }
        if (!$dry) db()->commit();
    } catch (Exception $e) {
        if (!$dry) db()->rollBack();
        throw $e;
    }

    $monthList = array_keys($months);
    sort($monthList);
    $stats = array(
        'dryRun' => $dry,
        'recordCount' => count($rows),
        'matchedCount' => $inserted + $updated,
        'inserted' => $inserted,
        'updated' => $updated,
        'failed' => $failed,
        'mismatch' => $mismatch,
        'staffCount' => count($fileStaff),
        'matchedStaffCount' => count($staffSet),
        'matchedBy' => $matchedBy,
        'index' => array(
            'feishu' => count($byFeishu),
            'empNo' => count($byEmp),
            'name' => count($byName)
        ),
        'reasons' => $reasons,
        'near' => array_values(array_filter($unmatched, function ($x) { return !empty($x['near']); })),
        'months' => $monthList,
        'unmatched' => array_values($unmatched)
    );
    if (!$dry) {
        audit_log('导入薪资', $monthList ? implode('、', $monthList) : '工资明细报表',
            '新增 ' . $inserted . ' 人，覆盖 ' . $updated . ' 人，失败 ' . $failed . ' 条，未匹配 ' . count($unmatched) . ' 人');
    }
    return $stats;
}

function api_salary_copy_last($in)
{
    $acc = require_admin();
    $month = in_str($in, 'month', 7);
    $prev = date('Y-m', strtotime($month . '-01 -1 month'));
    $cols = salary_copy_columns();
    $count = 0;
    foreach (active_staff_rows() as $s) {
        if (salary_row($s['id'], $month)) continue;
        $src = salary_row($s['id'], $prev);
        if (!$src) continue;
        $insertCols = array_merge(array('id', 'staff_id', 'month'), $cols, array('pay_status', 'pay_date', 'publish_at', 'published_by', 'hidden', 'remark', 'updated_by', 'updated_at'));
        $vals = array($s['id'] . '-' . $month, $s['id'], $month);
        foreach ($cols as $c) $vals[] = $src[$c];
        $vals[] = 'draft';
        $vals[] = null;
        $vals[] = null;
        $vals[] = '';
        $vals[] = 0;
        $vals[] = '复制 ' . $prev . ' 数值';
        $vals[] = $acc['name'];
        $vals[] = now_dt();
        $marks = implode(',', array_fill(0, count($insertCols), '?'));
        $st = db()->prepare('INSERT INTO salaries (' . implode(',', $insertCols) . ') VALUES (' . $marks . ')');
        $st->execute($vals);
        $count++;
    }
    if ($count) audit_log('复制上月薪资', $month, '复制 ' . $count . ' 人');
    return array('ok' => true, 'count' => $count);
}
