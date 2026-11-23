<?php
/* demo.php — 演示数据生成与导入（安装向导可选、系统设置可重置） */

function demo_months()
{
    $cur = date('Y-m');
    $m1 = date('Y-m', strtotime(date('Y-m-01') . ' -1 month'));
    $m2 = date('Y-m', strtotime(date('Y-m-01') . ' -2 month'));
    $m3 = date('Y-m', strtotime(date('Y-m-01') . ' -3 month'));
    return array('cur' => $cur, 'm1' => $m1, 'm2' => $m2, 'm3' => $m3);
}

function demo_staff_list()
{
    $m = demo_months();
    $T = function ($n) { return date('Y-m-d', strtotime(($n >= 0 ? '+' : '') . $n . ' days')); };
    $rows = array(
        array('id' => 'S001', 'name' => '陈晓岚', 'gender' => '女', 'id_card' => '350102198803120121', 'birth' => '1988-03-12', 'phone' => '13800000001', 'address' => '福州市仓山区金山街道农大路 12 号 5 号楼 302', 'position' => '店长', 'employment_type' => '全职', 'hire_date' => '2023-03-01', 'id_card_expiry' => '2033-03-12', 'health_cert_expiry' => $T(260), 'emergency' => '陈建国 13800000011', 'emp_no' => 'TA0051-001', 'status' => 'active', 'remark' => '店长本人账号，不可停用', 'created_at' => '2023-03-01 09:12:00', 'updated_at' => '2026-11-01 10:10:00', 'submitted_at' => '2023-03-01 09:12:00', 'reviewed_by' => '系统内置', 'reviewed_at' => '2023-03-01 09:12:00', 'reject_reason' => ''),
        array('id' => 'S002', 'name' => '林伟', 'gender' => '男', 'id_card' => '350102199005200134', 'birth' => '1990-05-20', 'phone' => '13800000002', 'address' => '福州市鼓楼区洪山镇梅峰路 88 号 3 号楼 601', 'position' => '店助', 'employment_type' => '全职', 'hire_date' => '2023-06-15', 'id_card_expiry' => '2031-05-20', 'health_cert_expiry' => $T(220), 'emergency' => '林小梅 13800000012', 'emp_no' => 'TA0051-002', 'status' => 'active', 'remark' => '', 'created_at' => '2023-06-15 09:20:00', 'updated_at' => '2026-10-20 14:30:00', 'submitted_at' => '2023-06-15 09:20:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2023-06-15 10:00:00', 'reject_reason' => ''),
        array('id' => 'S003', 'name' => '张明', 'gender' => '男', 'id_card' => '350102199808150152', 'birth' => '1998-08-15', 'phone' => '13900000001', 'address' => '福州市仓山区建新镇金山大道 618 号 2 号楼 401', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => '2024-05-20', 'id_card_expiry' => $T(45), 'health_cert_expiry' => $T(20), 'emergency' => '张建华 13900000011', 'emp_no' => 'TA0051-003', 'status' => 'active', 'remark' => '可带新人，负责晚班交接', 'created_at' => '2024-05-20 08:40:00', 'updated_at' => '2026-11-12 16:00:00', 'submitted_at' => '2024-05-20 08:40:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2024-05-21 09:10:00', 'reject_reason' => ''),
        array('id' => 'S004', 'name' => '李思雨', 'gender' => '女', 'id_card' => '350102200102100166', 'birth' => '2001-02-10', 'phone' => '13900000002', 'address' => '福州市闽侯县上街镇学府路 21 号 6 号楼 205', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => '2025-02-10', 'id_card_expiry' => '2032-02-10', 'health_cert_expiry' => $T(240), 'emergency' => '李国平 13900000012', 'emp_no' => 'TA0051-004', 'status' => 'active', 'remark' => '', 'created_at' => '2025-02-10 10:15:00', 'updated_at' => '2026-10-11 17:00:00', 'submitted_at' => '2025-02-10 10:15:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2025-02-10 14:20:00', 'reject_reason' => ''),
        array('id' => 'S005', 'name' => '王强', 'gender' => '男', 'id_card' => '350102199511080178', 'birth' => '1995-11-08', 'phone' => '13900000003', 'address' => '福州市仓山区盖山镇则徐大道 155 号 1 座 902', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => '2024-09-01', 'id_card_expiry' => '2030-11-08', 'health_cert_expiry' => $T(-5), 'emergency' => '王丽 13900000013', 'emp_no' => 'TA0051-005', 'status' => 'active', 'remark' => '健康证已过期，已提醒补办', 'created_at' => '2024-09-01 11:00:00', 'updated_at' => '2026-11-15 09:00:00', 'submitted_at' => '2024-09-01 11:00:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2024-09-01 15:40:00', 'reject_reason' => ''),
        array('id' => 'S006', 'name' => '赵敏', 'gender' => '女', 'id_card' => '350102199907030186', 'birth' => '1999-07-03', 'phone' => '13900000004', 'address' => '福州市晋安区岳峰镇连江北路 66 号 4 号楼 1203', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => '2025-07-03', 'id_card_expiry' => '2033-07-03', 'health_cert_expiry' => $T(95), 'emergency' => '赵卫东 13900000014', 'emp_no' => 'TA0051-006', 'status' => 'active', 'remark' => '', 'created_at' => '2025-07-03 09:30:00', 'updated_at' => '2026-09-20 11:20:00', 'submitted_at' => '2025-07-03 09:30:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2025-07-03 13:15:00', 'reject_reason' => ''),
        array('id' => 'S007', 'name' => '周杰', 'gender' => '男', 'id_card' => '350102200304180194', 'birth' => '2003-04-18', 'phone' => '13900000006', 'address' => '福州市闽侯县上街镇明德路 9 号学生公寓 3 栋 512', 'position' => '店员', 'employment_type' => '兼职', 'hire_date' => '2026-09-12', 'id_card_expiry' => '2031-04-18', 'health_cert_expiry' => $T(180), 'emergency' => '周海 13900000015', 'emp_no' => 'TA0051-007', 'status' => 'active', 'remark' => '在校生，周末与晚班', 'created_at' => '2026-09-12 10:00:00', 'updated_at' => '2026-09-12 14:00:00', 'submitted_at' => '2026-09-12 10:00:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2026-09-12 15:10:00', 'reject_reason' => ''),
        array('id' => 'S008', 'name' => '吴倩', 'gender' => '女', 'id_card' => '350102200206220208', 'birth' => '2002-06-22', 'phone' => '13900000005', 'address' => '福州市仓山区金山街道浦上大道 208 号 8 号楼 1602', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => $T(-3), 'id_card_expiry' => '2032-06-22', 'health_cert_expiry' => $T(300), 'emergency' => '吴建 13900000016', 'emp_no' => null, 'status' => 'pending', 'remark' => '', 'created_at' => date('Y-m-d H:i:s', time() - 3 * 3600), 'updated_at' => date('Y-m-d H:i:s', time() - 3 * 3600), 'submitted_at' => date('Y-m-d H:i:s', time() - 3 * 3600), 'reviewed_by' => '', 'reviewed_at' => null, 'reject_reason' => ''),
        array('id' => 'S009', 'name' => '郑浩', 'gender' => '男', 'id_card' => '350102199712090216', 'birth' => '1997-12-09', 'phone' => '13900000007', 'address' => '福州市马尾区罗星街道君竹路 36 号 2 号楼 501', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => $T(-1), 'id_card_expiry' => '2032-12-09', 'health_cert_expiry' => $T(330), 'emergency' => '郑丽 13900000017', 'emp_no' => null, 'status' => 'pending', 'remark' => '', 'created_at' => date('Y-m-d H:i:s', time() - 30 * 3600), 'updated_at' => date('Y-m-d H:i:s', time() - 30 * 3600), 'submitted_at' => date('Y-m-d H:i:s', time() - 30 * 3600), 'reviewed_by' => '', 'reviewed_at' => null, 'reject_reason' => ''),
        array('id' => 'S011', 'name' => '何佳', 'gender' => '女', 'id_card' => '350102200001250224', 'birth' => '2000-01-25', 'phone' => '13900000008', 'address' => '福州市台江区鳌峰街道江滨中大道 78 号 1 号楼 1801', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => $T(-6), 'id_card_expiry' => '2034-01-25', 'health_cert_expiry' => $T(150), 'emergency' => '何强 13900000018', 'emp_no' => null, 'status' => 'rejected', 'remark' => '', 'created_at' => date('Y-m-d H:i:s', time() - 52 * 3600), 'updated_at' => date('Y-m-d H:i:s', time() - 20 * 3600), 'submitted_at' => date('Y-m-d H:i:s', time() - 52 * 3600), 'reviewed_by' => '陈晓岚', 'reviewed_at' => date('Y-m-d H:i:s', time() - 20 * 3600), 'reject_reason' => '证件照片模糊，请重新上传清晰的身份证正面与反面照片。'),
        array('id' => 'S010', 'name' => '孙悦', 'gender' => '女', 'id_card' => '350102199609300232', 'birth' => '1996-09-30', 'phone' => '13900000009', 'address' => '福州市仓山区城门镇福峡路 128 号 3 号楼 705', 'position' => '店员', 'employment_type' => '全职', 'hire_date' => '2025-11-01', 'id_card_expiry' => '2032-09-30', 'health_cert_expiry' => $T(120), 'emergency' => '孙立 13900000019', 'emp_no' => 'TA0051-008', 'status' => 'resigned', 'remark' => '离职原因：个人发展', 'created_at' => '2025-11-01 10:00:00', 'updated_at' => '2026-10-15 11:00:00', 'submitted_at' => '2025-11-01 10:00:00', 'reviewed_by' => '陈晓岚', 'reviewed_at' => '2025-11-01 14:00:00', 'reject_reason' => '', 'resign_date' => '2026-10-15', 'resign_reason' => '个人发展，回老家工作', 'handover' => '收银台钥匙、备用金已交接给李思雨')
    );
    return $rows;
}

function demo_dimensions()
{
    $s = default_settings();
    return $s['dimensions'];
}

function demo_salary_base()
{
    return array(
        'S001' => array('base' => 6500, 'post' => 800, 'perf' => 600, 'full' => 200, 'ot' => 0, 'meal' => 300, 'commission' => 0, 'insurance' => 512.5, 'tax' => 45),
        'S002' => array('base' => 5200, 'post' => 600, 'perf' => 480, 'full' => 200, 'ot' => 90, 'meal' => 250, 'commission' => 120, 'insurance' => 460, 'tax' => 22.8),
        'S003' => array('base' => 3800, 'post' => 200, 'perf' => 320, 'full' => 200, 'ot' => 168, 'meal' => 200, 'commission' => 86.5, 'insurance' => 420, 'tax' => 8.4),
        'S004' => array('base' => 3900, 'post' => 200, 'perf' => 300, 'full' => 200, 'ot' => 72, 'meal' => 200, 'commission' => 132.4, 'insurance' => 430, 'tax' => 10.2),
        'S005' => array('base' => 4100, 'post' => 300, 'perf' => 280, 'full' => 200, 'ot' => 240, 'meal' => 200, 'commission' => 0, 'insurance' => 450, 'tax' => 12.6),
        'S006' => array('base' => 4000, 'post' => 250, 'perf' => 300, 'full' => 200, 'ot' => 96, 'meal' => 200, 'commission' => 45.8, 'insurance' => 440, 'tax' => 9.6),
        'S007' => array('base' => 2240, 'post' => 0, 'perf' => 120, 'full' => 100, 'ot' => 0, 'meal' => 0, 'commission' => 0, 'insurance' => 0, 'tax' => 0),
        'S010' => array('base' => 3900, 'post' => 200, 'perf' => 260, 'full' => 200, 'ot' => 0, 'meal' => 200, 'commission' => 60, 'insurance' => 430, 'tax' => 6)
    );
}

function demo_salary_row($staff, $month, $b, $status, $idx, $k)
{
    $jitter = ($idx + $k) % 3;
    $partTime = $staff['employment_type'] === '兼职';
    $base = $b['base'] + ($partTime ? $jitter * 20 : $jitter * 60);
    $ot = $b['ot'] + ($jitter === 2 ? 24 : 0);
    $holiday = ($idx === 2 && $staff['id'] === 'S003') ? 336 : (($idx === 2 && $staff['id'] === 'S005') ? 480 : 0);
    $commission = round($b['commission'] + ($jitter === 1 ? 12.5 : 0), 2);
    $leaveDed = ($idx === 1 && $k % 4 === 0) ? 126.44 : 0;
    $lateDed = ($idx === 0 && $k % 5 === 0) ? 30 : 0;
    $attDiff = $leaveDed ? 63.22 : (($idx === 0 && $k % 4 === 1) ? 40.5 : 0);
    $inventory = ($idx === 2 && $k % 4 === 0) ? 25 : 0;
    $discipline = ($staff['id'] === 'S005' && $idx === 2) ? 50 : 0;
    $disciplineReason = $discipline ? '未按 SOP 存放物料，造成原料损耗' : '';
    $actualDays = 26 - ($leaveDed ? 1 : 0);
    $transport = $partTime ? 0 : 50;
    $attSubsidy = $partTime ? 50 : 100;
    $social = $partTime ? 0 : 300;
    $income = array('baseSalary' => $base, 'postAllowance' => $b['post'], 'performancePay' => $b['perf'], 'fullAttendance' => $b['full'], 'dailyOvertimePay' => $ot, 'statutoryHolidayPay' => $holiday, 'mealSubsidy' => $b['meal'], 'transportSubsidy' => $transport, 'attendanceSubsidy' => $attSubsidy, 'socialSubsidy' => $social, 'commission' => $commission);
    $deduct = array('inventoryDeduction' => $inventory, 'lateDeduction' => $lateDed, 'attendanceDiff' => $attDiff, 'leaveDeduction' => $leaveDed, 'disciplineDeduction' => $discipline, 'otherDeduction' => 0, 'insurance' => $b['insurance'], 'tax' => $b['tax']);
    $calc = calc_salary(array_merge($income, $deduct));
    return array(
        'id' => $staff['id'] . '-' . $month, 'staff_id' => $staff['id'], 'month' => $month,
        'should_days' => 26, 'actual_days' => $actualDays, 'total_hours' => round($actualDays * 8, 2),
        'base_salary' => $income['baseSalary'], 'post_allowance' => $income['postAllowance'], 'performance_pay' => $income['performancePay'],
        'full_attendance' => $income['fullAttendance'], 'daily_overtime_pay' => $income['dailyOvertimePay'],
        'statutory_holiday_pay' => $income['statutoryHolidayPay'], 'meal_subsidy' => $income['mealSubsidy'],
        'transport_subsidy' => $income['transportSubsidy'], 'attendance_subsidy' => $income['attendanceSubsidy'],
        'social_subsidy' => $income['socialSubsidy'], 'commission' => $income['commission'], 'gross_pay' => $calc['grossPay'],
        'inventory_deduction' => $inventory, 'late_deduction' => $lateDed, 'attendance_diff' => $attDiff,
        'leave_deduction' => $leaveDed, 'discipline_deduction' => $discipline, 'discipline_reason' => $disciplineReason,
        'other_deduction' => 0, 'other_reason' => '', 'insurance' => $b['insurance'], 'tax' => $b['tax'],
        'deduction_total' => $calc['deductionTotal'], 'net_pay' => $calc['netPay'],
        'pay_status' => $status, 'pay_date' => $status === 'published' ? $month . '-10' : null,
        'publish_at' => $status === 'published' ? $month . '-09 10:00:00' : null,
        'published_by' => $status === 'published' ? '陈晓岚' : '', 'hidden' => 0, 'remark' => '',
        'updated_by' => '陈晓岚', 'updated_at' => $month . '-08 17:20:00'
    );
}

function demo_score_dims($ratio, $jitter)
{
    $out = array();
    foreach (demo_dimensions() as $i => $d) {
        $j = $jitter ? ((($i + $jitter) % 3) - 1) * 0.5 : 0;
        $score = max(0, min($d['full'], round($d['full'] * $ratio + $j, 2)));
        $out[] = array('key' => $d['key'], 'name' => $d['name'], 'full' => $d['full'], 'score' => $score);
    }
    return $out;
}

function demo_dataset()
{
    $months = demo_months();
    $staff = demo_staff_list();
    $byId = array();
    foreach ($staff as $s) $byId[$s['id']] = $s;

    $accounts = array();
    $addAcc = function ($staffId, $role, $pw, $status) use (&$accounts, $byId) {
        $s = $byId[$staffId];
        $accounts[] = array(
            'id' => 'A' . substr($staffId, 1), 'phone' => $s['phone'], 'name' => $s['name'],
            'role' => $role, 'staff_id' => $staffId, 'status' => $status,
            'password' => $pw, 'created_at' => $s['created_at'], 'last_login_at' => null
        );
    };
    $addAcc('S001', 'superadmin', 'admin123', 'active');
    $addAcc('S002', 'admin', 'admin123', 'active');
    foreach (array('S003', 'S004', 'S005', 'S006', 'S007', 'S008', 'S009', 'S011') as $id) {
        $addAcc($id, 'staff', 'a123456', 'active');
    }
    $addAcc('S010', 'staff', 'a123456', 'disabled');

    $base = demo_salary_base();
    $salaries = array();
    $history = array($months['m3'], $months['m2'], $months['m1']);
    foreach ($history as $idx => $m) {
        $k = 0;
        foreach (array('S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S010') as $id) {
            if ($id === 'S010' && $idx === 0) { $k++; continue; }
            if ($id === 'S007' && $idx === 0) { $k++; continue; }
            $salaries[] = demo_salary_row($byId[$id], $m, $base[$id], 'published', $idx, $k);
            $k++;
        }
    }
    foreach (array('S003', 'S004', 'S005') as $i => $id) {
        $row = demo_salary_row($byId[$id], $months['cur'], $base[$id], 'draft', 3, $i);
        $row['actual_days'] = $i === 0 ? 12 : ($i === 1 ? 0 : 10);
        $row['total_hours'] = round($row['actual_days'] * 8, 2);
        $row['pay_date'] = null;
        $row['publish_at'] = null;
        $row['remark'] = $i === 1 ? '本月新入职培训中，出勤待确认' : '';
        $salaries[] = $row;
    }

    $scores = array();
    $ratios = array('S001' => 0.96, 'S002' => 0.93, 'S003' => 0.87, 'S004' => 0.9, 'S005' => 0.78, 'S006' => 0.85, 'S007' => 0.82, 'S010' => 0.74);
    foreach ($history as $mi => $m) {
        $si = 0;
        foreach ($ratios as $id => $ratio) {
            if ($id === 'S010' && $m >= $months['m1']) { $si++; continue; }
            if ($id === 'S007' && $m < '2026-09') { $si++; continue; }
            $r = min(0.99, $ratio + ($mi - 2) * 0.022 + (($si % 3) - 1) * 0.012);
            $dims = demo_score_dims($r, $si + $mi);
            $adjust = array();
            if ($si % 4 === 0) $adjust[] = array('value' => 2, 'reason' => '顾客当场表扬，服务态度好', 'date' => $m . '-18', 'by' => '陈晓岚');
            if ($si % 5 === 0) $adjust[] = array('value' => -1, 'reason' => '交接班记录漏填', 'date' => $m . '-25', 'by' => '陈晓岚');
            $total = 0;
            foreach ($dims as $d) $total += $d['score'];
            foreach ($adjust as $a) $total += $a['value'];
            $total = max(0, min(100, round($total, 2)));
            $cfg = default_settings();
            $scores[] = array(
                'id' => $id . '-' . $m, 'staff_id' => $id, 'month' => $m,
                'dims_json' => json_encode($dims, JSON_UNESCAPED_UNICODE),
                'adjust_json' => json_encode($adjust, JSON_UNESCAPED_UNICODE),
                'total' => $total, 'grade' => grade_of_total($total, $cfg), 'status' => 'published',
                'publish_at' => $m . '-28 18:00:00', 'published_by' => '陈晓岚',
                'updated_by' => '陈晓岚', 'updated_at' => $m . '-28 17:00:00'
            );
            $si++;
        }
    }
    foreach (array('S003', 'S004', 'S006', 'S007') as $i => $id) {
        $dims = demo_score_dims(0.86 + $i * 0.01, $i);
        $adjust = $i === 0 ? array(array('value' => 1, 'reason' => '主动支援后厨高峰期', 'date' => date('Y-m-d', time() - 2 * 86400), 'by' => '林伟')) : array();
        $total = 0;
        foreach ($dims as $d) $total += $d['score'];
        foreach ($adjust as $a) $total += $a['value'];
        $total = max(0, min(100, round($total, 2)));
        $cfg = default_settings();
        $scores[] = array(
            'id' => $id . '-' . $months['cur'], 'staff_id' => $id, 'month' => $months['cur'],
            'dims_json' => json_encode($dims, JSON_UNESCAPED_UNICODE),
            'adjust_json' => json_encode($adjust, JSON_UNESCAPED_UNICODE),
            'total' => $total, 'grade' => grade_of_total($total, $cfg), 'status' => 'draft',
            'publish_at' => null, 'published_by' => '', 'updated_by' => '林伟',
            'updated_at' => date('Y-m-d H:i:s', time() - 6 * 3600)
        );
    }

    $leaves = array();
    $leaveSeq = 1;
    $mkLeave = function ($staffId, $date, $status, $extra) use (&$leaves, &$leaveSeq, $months, $byId) {
        $id = 'LH-' . str_replace('-', '', month_of($date)) . '-' . str_pad((string)$leaveSeq++, 2, '0', STR_PAD_LEFT);
        $base = array(
            'id' => $id, 'staff_id' => $staffId, 'date' => $date, 'type' => '事假', 'reason' => '',
            'status' => $status, 'manual' => 0,
            'created_at' => date('Y-m-d H:i:s', strtotime($date . ' -6 days')),
            'updated_at' => null,
            'reviewed_by' => $status === 'pending' ? '' : '陈晓岚',
            'reviewed_at' => $status === 'pending' ? null : date('Y-m-d H:i:s', strtotime($date . ' -5 days')),
            'reject_reason' => '', 'cancel_requested' => 0, 'cancel_requested_at' => null, 'force_reason' => ''
        );
        $leaves[] = array_merge($base, $extra);
    };
    $cur = $months['cur'];
    $mkLeave('S003', $cur . '-04', 'approved', array());
    $mkLeave('S003', $cur . '-11', 'approved', array());
    $mkLeave('S004', $cur . '-07', 'approved', array());
    $mkLeave('S006', $cur . '-02', 'approved', array());
    $mkLeave('S003', $cur . '-19', 'pending', array('reason' => '家中有事，提前安排', 'created_at' => date('Y-m-d H:i:s', time() - 3 * 3600)));
    $mkLeave('S005', $cur . '-21', 'pending', array('reason' => '家中有事，提前安排', 'created_at' => date('Y-m-d H:i:s', time() - 30 * 3600)));
    $mkLeave('S006', $cur . '-18', 'pending', array('reason' => '家中安排', 'created_at' => date('Y-m-d H:i:s', time() - 9 * 3600)));
    $mkLeave('S001', $cur . '-24', 'pending', array('reason' => '个人事务', 'created_at' => date('Y-m-d H:i:s', time() - 20 * 3600)));
    $mkLeave('S007', $cur . '-17', 'rejected', array('reject_reason' => '当日人手不足，请调整到其他日期'));
    $mkLeave('S002', $cur . '-13', 'approved', array());
    $mkLeave('S005', $cur . '-15', 'approved', array('type' => '事假', 'reason' => '家中有事需处理'));
    $mkLeave('S004', $cur . '-14', 'approved', array('type' => '病假', 'reason' => '感冒发热，已就医'));
    $mkLeave('S004', $cur . '-21', 'approved', array('cancel_requested' => 1, 'cancel_requested_at' => date('Y-m-d H:i:s', time() - 6 * 3600)));

    $prev = $months['m1'];
    $prevRows = array(array('S003', '-06'), array('S003', '-20'), array('S004', '-13'), array('S005', '-09'), array('S006', '-16'), array('S002', '-24'), array('S007', '-11'));
    $seq = 1;
    foreach ($prevRows as $row) {
        $leaves[] = array(
            'id' => 'LH-' . str_replace('-', '', $prev) . '-' . str_pad((string)$seq++, 2, '0', STR_PAD_LEFT),
            'staff_id' => $row[0], 'date' => $prev . $row[1], 'type' => '事假', 'reason' => '',
            'status' => 'approved', 'manual' => 0,
            'created_at' => date('Y-m-d H:i:s', strtotime($prev . $row[1] . ' -6 days')),
            'updated_at' => null, 'reviewed_by' => '陈晓岚',
            'reviewed_at' => date('Y-m-d H:i:s', strtotime($prev . $row[1] . ' -5 days')),
            'reject_reason' => '', 'cancel_requested' => 0, 'cancel_requested_at' => null, 'force_reason' => ''
        );
    }

    $shifts = array();
    $shiftSeq = 1;
    $mkShift = function ($staffId, $slots, $status, $extra) use (&$shifts, &$shiftSeq, $cur) {
        $id = 'SF-' . str_replace('-', '', $cur) . '-' . str_pad((string)$shiftSeq++, 2, '0', STR_PAD_LEFT);
        $base = array(
            'id' => $id, 'staff_id' => $staffId, 'month' => $cur,
            'slots_json' => json_encode($slots, JSON_UNESCAPED_UNICODE), 'note' => '',
            'status' => $status,
            'created_at' => date('Y-m-d H:i:s', time() - 2 * 86400),
            'updated_at' => null,
            'reviewed_by' => $status === 'pending' ? '' : '陈晓岚',
            'reviewed_at' => $status === 'pending' ? null : date('Y-m-d H:i:s', time() - 86400),
            'reject_reason' => '', 'cancel_requested' => 0, 'cancel_requested_at' => null
        );
        $shifts[] = array_merge($base, $extra);
    };
    $mkShift('S007', array(
        array('date' => $cur . '-06', 'start' => '17:00', 'end' => '22:00'),
        array('date' => $cur . '-09', 'start' => '17:00', 'end' => '22:00')
    ), 'approved', array());
    $mkShift('S007', array(
        array('date' => $cur . '-16', 'start' => '11:00', 'end' => '15:00'),
        array('date' => $cur . '-17', 'start' => '11:00', 'end' => '15:00')
    ), 'pending', array('note' => '周末可全天到店，可临时顶班', 'created_at' => date('Y-m-d H:i:s', time() - 5 * 3600)));
    $mkShift('S007', array(
        array('date' => $cur . '-12', 'start' => '09:00', 'end' => '13:00')
    ), 'rejected', array('reject_reason' => '该时段已有其他兼职到岗，请调整时间'));

    $notices = array();
    $noticeReads = array();
    $noticeSeed = array(
        array('总部通知', '11 月门店巡检安排', '总部将于 11 月 20 日对全部门店进行巡检，请提前整理后厨与前厅，确保健康证、消毒记录齐全。', 1, 1),
        array('总部通知', '新品「芝士牛肉堡」上市', '新品将于本周五上线，请完成员工试吃与话术培训，物料包已随配送发出。', 0, 0),
        array('餐厅通知', '本周排班与交接班要求', '本周晚高峰提前至 17:00，请值班经理确认交接班记录并同步至考勤台账。', 0, 1),
        array('门店通知', '员工休息区整理提醒', '请保持休息区整洁，个人物品请放入储物柜，离开时关闭空调与照明。', 0, 0)
    );
    foreach ($noticeSeed as $i => $n) {
        $nid = 'NT-' . date('Ymd') . '-' . str_pad((string)($i + 1), 2, '0', STR_PAD_LEFT);
        $notices[] = array(
            'id' => $nid, 'category' => $n[0], 'title' => $n[1], 'body' => $n[2],
            'status' => 'published', 'pinned' => $n[3], 'important' => $n[4],
            'publisher' => '陈晓岚', 'publisher_id' => 'S001',
            'published_at' => date('Y-m-d H:i:s', time() - ($i + 1) * 7200),
            'created_at' => date('Y-m-d H:i:s', time() - ($i + 1) * 7200), 'updated_at' => null
        );
    }
    $noticeReads[] = array('notice_id' => $notices[0]['id'], 'staff_id' => 'S002', 'read_at' => date('Y-m-d H:i:s', time() - 3600));
    $noticeReads[] = array('notice_id' => $notices[2]['id'], 'staff_id' => 'S003', 'read_at' => date('Y-m-d H:i:s', time() - 1800));

    $attendance = array();
    $restDays = function ($s) { return $s['employment_type'] === '全职' ? 4 : ($s['employment_type'] === '兼职' ? 2 : 0); };
    foreach (array('S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S010') as $id) {
        foreach (array($prev, $cur) as $m) {
            if ($id === 'S010' && $m === $cur) continue;
            $attendance[] = array(
                'staff_id' => $id, 'month' => $m, 'should_rest_days' => $restDays($byId[$id]),
                'actual_work_days' => $m === $cur ? 15 : 22, 'remark' => '',
                'updated_by' => '陈晓岚', 'updated_at' => $m . '-01 10:00:00'
            );
        }
    }

    $corrections = array(array(
        'id' => 'CR-001', 'staff_id' => 'S003', 'field' => 'phone', 'field_label' => '手机号',
        'old_value' => '13900000001', 'new_value' => '13900000010',
        'note' => '原手机号已停用，申请更换为现用号码', 'status' => 'pending',
        'created_at' => date('Y-m-d H:i:s', time() - 4 * 3600), 'reviewed_by' => '', 'reviewed_at' => null, 'reject_reason' => ''
    ));

    $audit = array(
        array('time' => date('Y-m-d H:i:s', time() - 2 * 3600), 'operator' => '陈晓岚', 'role' => 'superadmin', 'target' => '张明', 'action' => '查看完整身份证号', 'detail' => '档案详情页查看完整身份证号'),
        array('time' => date('Y-m-d H:i:s', time() - 20 * 3600), 'operator' => '陈晓岚', 'role' => 'superadmin', 'target' => '何佳', 'action' => '审核驳回', 'detail' => '驳回原因：证件照片模糊'),
        array('time' => date('Y-m-d H:i:s', time() - 26 * 3600), 'operator' => '林伟', 'role' => 'admin', 'target' => $months['m1'] . ' 薪资', 'action' => '发布薪资', 'detail' => '发布 8 人薪资'),
        array('time' => date('Y-m-d H:i:s', time() - 48 * 3600), 'operator' => '林伟', 'role' => 'admin', 'target' => '孙悦', 'action' => '标记离职', 'detail' => '离职日期 2026-10-15'),
        array('time' => date('Y-m-d H:i:s', time() - 70 * 3600), 'operator' => '陈晓岚', 'role' => 'superadmin', 'target' => '员工名单', 'action' => '导出名单', 'detail' => '导出在职员工名单 CSV')
    );

    /* 任务下发演示：一个「打烊清洁」母任务 + 3 个子任务，昨天全部通过、今天 1/3 */
    $taskStart = date('Y-m-d', strtotime('-40 day'));
    $taskCreated = date('Y-m-d H:i:s', strtotime('-40 day'));
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    $todayDate = date('Y-m-d');
    $taskTemplates = array(
        array('id' => 'TT-005', 'title' => '打烊清洁', 'content' => '闭店后完成后场分区清洁，各子任务分别拍照上传，全部审核通过即本组完成。',
            'parent_id' => null, 'cycle' => 'daily', 'weekdays' => '', 'month_day' => 0,
            'start_date' => $taskStart, 'end_date' => null, 'store_codes' => '', 'status' => 'enabled',
            'created_by' => '陈晓岚', 'created_at' => $taskCreated),
        array('id' => 'TT-006', 'title' => '前台清洁', 'content' => '收银台、取餐口与前台地面清洁，垃圾清运后拍照上传。',
            'parent_id' => 'TT-005', 'cycle' => 'daily', 'weekdays' => '', 'month_day' => 0,
            'start_date' => $taskStart, 'end_date' => null, 'store_codes' => '', 'status' => 'enabled',
            'created_by' => '陈晓岚', 'created_at' => $taskCreated),
        array('id' => 'TT-007', 'title' => '台面清洁', 'content' => '就餐区桌面、座椅与调料台擦拭消毒，拍照上传。',
            'parent_id' => 'TT-005', 'cycle' => 'daily', 'weekdays' => '', 'month_day' => 0,
            'start_date' => $taskStart, 'end_date' => null, 'store_codes' => '', 'status' => 'enabled',
            'created_by' => '陈晓岚', 'created_at' => $taskCreated),
        array('id' => 'TT-008', 'title' => '地面清洁', 'content' => '后厨与就餐区地面刷洗、油污清理，拍照上传。',
            'parent_id' => 'TT-005', 'cycle' => 'daily', 'weekdays' => '', 'month_day' => 0,
            'start_date' => $taskStart, 'end_date' => null, 'store_codes' => '', 'status' => 'enabled',
            'created_by' => '陈晓岚', 'created_at' => $taskCreated)
    );
    $taskInstances = array(
        array('template_id' => 'TT-006', 'period_date' => $yesterday, 'status' => 'approved', 'submitter_id' => 'S003', 'submitter_name' => '张明',
            'submitted_at' => date('Y-m-d H:i:s', strtotime('-1 day -6 hour')), 'reviewed_by' => '陈晓岚', 'reviewed_at' => date('Y-m-d H:i:s', strtotime('-1 day -5 hour'))),
        array('template_id' => 'TT-007', 'period_date' => $yesterday, 'status' => 'approved', 'submitter_id' => 'S004', 'submitter_name' => '李思雨',
            'submitted_at' => date('Y-m-d H:i:s', strtotime('-1 day -5 hour')), 'reviewed_by' => '陈晓岚', 'reviewed_at' => date('Y-m-d H:i:s', strtotime('-1 day -4 hour'))),
        array('template_id' => 'TT-008', 'period_date' => $yesterday, 'status' => 'approved', 'submitter_id' => 'S007', 'submitter_name' => '王芳',
            'submitted_at' => date('Y-m-d H:i:s', strtotime('-1 day -4 hour')), 'reviewed_by' => '陈晓岚', 'reviewed_at' => date('Y-m-d H:i:s', strtotime('-1 day -3 hour'))),
        array('template_id' => 'TT-006', 'period_date' => $todayDate, 'status' => 'approved', 'submitter_id' => 'S003', 'submitter_name' => '张明',
            'submitted_at' => date('Y-m-d H:i:s', strtotime('-6 hour')), 'reviewed_by' => '陈晓岚', 'reviewed_at' => date('Y-m-d H:i:s', strtotime('-5 hour'))),
        array('template_id' => 'TT-007', 'period_date' => $todayDate, 'status' => 'submitted', 'submitter_id' => 'S004', 'submitter_name' => '李思雨',
            'submitted_at' => date('Y-m-d H:i:s', strtotime('-1 hour')), 'reviewed_by' => '', 'reviewed_at' => null),
        array('template_id' => 'TT-008', 'period_date' => $todayDate, 'status' => 'pending', 'submitter_id' => null, 'submitter_name' => '',
            'submitted_at' => null, 'reviewed_by' => '', 'reviewed_at' => null)
    );

    return array(
        'store' => array('name' => '塔斯汀 福州市农大金山校区店', 'short_name' => '塔斯汀 农大金山校区店', 'code' => 'TA0051'),
        'settings' => default_settings(),
        'staff' => $staff,
        'accounts' => $accounts,
        'salaries' => $salaries,
        'scores' => $scores,
        'leaves' => $leaves,
        'shifts' => $shifts,
        'notices' => $notices,
        'noticeReads' => $noticeReads,
        'attendance' => $attendance,
        'corrections' => $corrections,
        /* 演示数据不含健康证原件，核验记录留空；上传证件后可在「健康证核验」中操作 */
        'healthVerifications' => array(),
        'taskTemplates' => $taskTemplates,
        'taskInstances' => $taskInstances,
        'audit' => $audit
    );
}

function demo_import($skipStaffIds = array())
{
    $pdo = db();
    $d = demo_dataset();
    $counts = array('staff' => 0, 'accounts' => 0, 'salaries' => 0, 'scores' => 0, 'leaves' => 0, 'shifts' => 0, 'notices' => 0, 'noticeReads' => 0, 'attendance' => 0, 'taskTemplates' => 0, 'taskInstances' => 0, 'corrections' => 0, 'healthVerifications' => 0);

    $pdo->beginTransaction();
    try {
        foreach ($d['staff'] as $s) {
            if (in_array($s['id'], $skipStaffIds, true)) continue;
            $exists = staff_by_id($s['id']);
            if ($exists) continue;
            $cols = array('id', 'name', 'gender', 'id_card', 'birth', 'phone', 'address', 'position', 'employment_type', 'hire_date', 'id_card_expiry', 'health_cert_expiry', 'emergency', 'emp_no', 'status', 'remark', 'files_json', 'created_at', 'updated_at', 'submitted_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'resign_date', 'resign_reason', 'handover');
            $vals = array(
                $s['id'], $s['name'], $s['gender'], $s['id_card'], $s['birth'], $s['phone'], $s['address'], $s['position'],
                $s['employment_type'], $s['hire_date'], $s['id_card_expiry'], $s['health_cert_expiry'], $s['emergency'],
                $s['emp_no'], $s['status'], $s['remark'], '{}', $s['created_at'], $s['updated_at'], $s['submitted_at'],
                $s['reviewed_by'], $s['reviewed_at'], $s['reject_reason'],
                isset($s['resign_date']) ? $s['resign_date'] : null,
                isset($s['resign_reason']) ? $s['resign_reason'] : '',
                isset($s['handover']) ? $s['handover'] : ''
            );
            $marks = implode(',', array_fill(0, count($cols), '?'));
            $st = $pdo->prepare('INSERT INTO staff (' . implode(',', $cols) . ') VALUES (' . $marks . ')');
            $st->execute($vals);
            $counts['staff']++;
        }

        foreach ($d['accounts'] as $a) {
            if (in_array($a['staff_id'], $skipStaffIds, true)) continue;
            if (account_by_id($a['id'])) continue;
            $st = $pdo->prepare('SELECT id FROM accounts WHERE phone = ?');
            $st->execute(array($a['phone']));
            if ($st->fetch()) continue;
            $st = $pdo->prepare('INSERT INTO accounts (id, phone, name, role, staff_id, status, password_hash, first_login, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,0,?,?)');
            $st->execute(array($a['id'], $a['phone'], $a['name'], $a['role'], $a['staff_id'], $a['status'], password_hash($a['password'], PASSWORD_DEFAULT), $a['created_at'], $a['last_login_at']));
            $counts['accounts']++;
        }

        $salaryCols = array('id', 'staff_id', 'month', 'should_days', 'actual_days', 'total_hours', 'base_salary', 'post_allowance', 'performance_pay', 'full_attendance', 'daily_overtime_pay', 'statutory_holiday_pay', 'meal_subsidy', 'transport_subsidy', 'attendance_subsidy', 'social_subsidy', 'commission', 'gross_pay', 'inventory_deduction', 'late_deduction', 'attendance_diff', 'leave_deduction', 'discipline_deduction', 'discipline_reason', 'other_deduction', 'other_reason', 'insurance', 'tax', 'deduction_total', 'net_pay', 'pay_status', 'pay_date', 'publish_at', 'published_by', 'hidden', 'remark', 'updated_by', 'updated_at');
        $salarySql = 'INSERT INTO salaries (' . implode(',', $salaryCols) . ') VALUES (' . implode(',', array_fill(0, count($salaryCols), '?')) . ')';
        foreach ($d['salaries'] as $s) {
            if (!staff_by_id($s['staff_id'])) continue;
            $vals = array();
            foreach ($salaryCols as $c) $vals[] = isset($s[$c]) ? $s[$c] : null;
            $st = $pdo->prepare($salarySql);
            $st->execute($vals);
            $counts['salaries']++;
        }

        $scoreCols = array('id', 'staff_id', 'month', 'dims_json', 'adjust_json', 'total', 'grade', 'status', 'publish_at', 'published_by', 'updated_by', 'updated_at');
        $scoreSql = 'INSERT INTO scores (' . implode(',', $scoreCols) . ') VALUES (' . implode(',', array_fill(0, count($scoreCols), '?')) . ')';
        foreach ($d['scores'] as $s) {
            if (!staff_by_id($s['staff_id'])) continue;
            $vals = array();
            foreach ($scoreCols as $c) $vals[] = isset($s[$c]) ? $s[$c] : null;
            $st = $pdo->prepare($scoreSql);
            $st->execute($vals);
            $counts['scores']++;
        }

        $leaveCols = array('id', 'staff_id', 'date', 'type', 'reason', 'status', 'manual', 'created_at', 'updated_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'cancel_requested', 'cancel_requested_at', 'force_reason');
        $leaveSql = 'INSERT INTO leaves (' . implode(',', $leaveCols) . ') VALUES (' . implode(',', array_fill(0, count($leaveCols), '?')) . ')';
        foreach ($d['leaves'] as $s) {
            if (!staff_by_id($s['staff_id'])) continue;
            $vals = array();
            foreach ($leaveCols as $c) $vals[] = isset($s[$c]) ? $s[$c] : null;
            $st = $pdo->prepare($leaveSql);
            $st->execute($vals);
            $counts['leaves']++;
        }

        $shiftCols = array('id', 'staff_id', 'month', 'slots_json', 'note', 'status', 'created_at', 'updated_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'cancel_requested', 'cancel_requested_at');
        $shiftSql = 'INSERT INTO shift_requests (' . implode(',', $shiftCols) . ') VALUES (' . implode(',', array_fill(0, count($shiftCols), '?')) . ')';
        foreach ($d['shifts'] as $s) {
            if (!staff_by_id($s['staff_id'])) continue;
            $vals = array();
            foreach ($shiftCols as $c) $vals[] = isset($s[$c]) ? $s[$c] : null;
            $st = $pdo->prepare($shiftSql);
            $st->execute($vals);
            $counts['shifts']++;
        }

        $noticeCols = array('id', 'category', 'title', 'body', 'status', 'pinned', 'important', 'publisher', 'publisher_id', 'published_at', 'created_at', 'updated_at');
        $noticeSql = 'INSERT INTO notices (' . implode(',', $noticeCols) . ') VALUES (' . implode(',', array_fill(0, count($noticeCols), '?')) . ')';
        foreach ($d['notices'] as $n) {
            $vals = array();
            foreach ($noticeCols as $c) $vals[] = isset($n[$c]) ? $n[$c] : null;
            $pdo->prepare($noticeSql)->execute($vals);
            $counts['notices']++;
        }
        $st = $pdo->prepare('INSERT IGNORE INTO notice_reads (notice_id, staff_id, read_at) VALUES (?,?,?)');
        foreach ($d['noticeReads'] as $r) {
            if (!staff_by_id($r['staff_id'])) continue;
            $st->execute(array($r['notice_id'], $r['staff_id'], $r['read_at']));
            $counts['noticeReads']++;
        }

        $attCols = array('staff_id', 'month', 'should_rest_days', 'actual_work_days', 'remark', 'updated_by', 'updated_at');
        $attSql = 'INSERT INTO attendance (' . implode(',', $attCols) . ') VALUES (' . implode(',', array_fill(0, count($attCols), '?')) . ')';
        foreach ($d['attendance'] as $s) {
            if (!staff_by_id($s['staff_id'])) continue;
            $vals = array();
            foreach ($attCols as $c) $vals[] = isset($s[$c]) ? $s[$c] : null;
            $st = $pdo->prepare($attSql);
            $st->execute($vals);
            $counts['attendance']++;
        }

        /* 任务模板：先插入顶层母任务，再插入子任务，避免自引用外键失败 */
        $tplCols = array('id', 'title', 'content', 'parent_id', 'cycle', 'weekdays', 'month_day', 'start_date', 'end_date', 'store_codes', 'status', 'created_by', 'created_at');
        $tplSql = 'INSERT IGNORE INTO task_templates (' . implode(',', $tplCols) . ', updated_at) VALUES (' . implode(',', array_fill(0, count($tplCols), '?')) . ', NULL)';
        foreach (array(false, true) as $childPass) {
            foreach ($d['taskTemplates'] as $t) {
                if (($t['parent_id'] !== null) !== $childPass) continue;
                $vals = array();
                foreach ($tplCols as $c) $vals[] = isset($t[$c]) ? $t[$c] : null;
                $pdo->prepare($tplSql)->execute($vals);
                $counts['taskTemplates']++;
            }
        }
        $insCols = array('template_id', 'period_date', 'status', 'submitter_id', 'submitter_name', 'submitted_at', 'reviewed_by', 'reviewed_at', 'reject_reason');
        $insSql = 'INSERT IGNORE INTO task_instances (' . implode(',', $insCols) . ', created_at) VALUES (' . implode(',', array_fill(0, count($insCols), '?')) . ', ' . $pdo->quote(now_dt()) . ')';
        foreach ($d['taskInstances'] as $i) {
            if ($i['submitter_id'] && !staff_by_id($i['submitter_id'])) continue;
            $vals = array();
            foreach ($insCols as $c) $vals[] = isset($i[$c]) ? $i[$c] : null;
            $pdo->prepare($insSql)->execute($vals);
            $counts['taskInstances']++;
        }

        foreach ($d['corrections'] as $c) {
            if (!staff_by_id($c['staff_id'])) continue;
            $st = $pdo->prepare('INSERT INTO corrections (id, staff_id, field, field_label, old_value, new_value, note, status, created_at, reviewed_by, reviewed_at, reject_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
            $st->execute(array($c['id'], $c['staff_id'], $c['field'], $c['field_label'], $c['old_value'], $c['new_value'], $c['note'], $c['status'], $c['created_at'], $c['reviewed_by'], $c['reviewed_at'], $c['reject_reason']));
            $counts['corrections']++;
        }

        foreach ($d['healthVerifications'] as $h) {
            if (!staff_by_id($h['staff_id'])) continue;
            $st = $pdo->prepare('INSERT IGNORE INTO health_cert_verifications (id, staff_id, cert_key, result, remark, material_key, material_name, verified_by, verified_name, verified_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
            $st->execute(array($h['id'], $h['staff_id'], $h['cert_key'], $h['result'], $h['remark'], '', '', $h['verified_by'], $h['verified_name'], $h['verified_at'], $h['verified_at']));
            $counts['healthVerifications']++;
        }

        $st = $pdo->prepare('INSERT INTO audit_logs (time, operator, role, target, action, detail, ip) VALUES (?,?,?,?,?,?,?)');
        foreach ($d['audit'] as $l) {
            $st->execute(array($l['time'], $l['operator'], $l['role'], $l['target'], $l['action'], $l['detail'], '127.0.0.1'));
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
    return $counts;
}

function demo_reset()
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach (array('expiry_records', 'expiry_materials', 'expiry_categories', 'feedback_replies', 'feedbacks', 'birthday_greetings', 'health_cert_verifications', 'reimburse_claims', 'staff_payees', 'task_instances', 'task_templates', 'salaries', 'scores', 'leaves', 'shift_requests', 'notice_reads', 'notices', 'schedule_participants', 'schedules', 'attendance_daily', 'attendance', 'corrections', 'messages', 'accounts', 'staff', 'login_locks') as $t) {
            $pdo->exec('DELETE FROM ' . $t);
        }
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
    reimburse_seed_default_categories();
    expiry_seed_defaults();
    $d = demo_dataset();
    $st = $pdo->prepare('UPDATE store_settings SET store_name=?, short_name=?, code=?, settings_json=?, updated_at=? WHERE id=1');
    $st->execute(array($d['store']['name'], $d['store']['short_name'], $d['store']['code'], json_encode($d['settings'], JSON_UNESCAPED_UNICODE), now_dt()));
    return demo_import();
}
