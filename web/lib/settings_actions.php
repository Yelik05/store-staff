<?php
/* settings_actions.php — 工作台、系统设置、日志、备份恢复与演示数据 */

require_once __DIR__ . '/demo.php';
require_once __DIR__ . '/task_actions.php';

function api_dashboard($in)
{
    require_admin();
    $cur = date('Y-m');
    $now = time();

    $staffRows = db()->query('SELECT * FROM staff')->fetchAll();
    $pendingList = array();
    $expiring = array();
    $activeCount = 0;
    $pendingCount = 0;
    $resignedCount = 0;
    foreach ($staffRows as $s) {
        if ($s['status'] === 'pending') {
            $pendingCount++;
            $submitted = $s['submitted_at'] ? $s['submitted_at'] : $s['created_at'];
            $pendingList[] = array(
                'id' => $s['id'], 'name' => $s['name'], 'position' => normalize_position($s['position']),
                'submittedAt' => iso($submitted),
                'waitedHours' => max(0, (int)floor(($now - strtotime($submitted)) / 3600)),
                'photo' => staff_files($s)['photo']
            );
        }
        if ($s['status'] === 'resigned') $resignedCount++;
        if ($s['status'] === 'active') {
            $activeCount++;
            $info = expiry_info($s);
            if ($info['health']['state'] === 'expired' || $info['health']['state'] === 'soon') {
                $expiring[] = array('id' => $s['id'], 'name' => $s['name'], 'position' => normalize_position($s['position']), 'type' => '健康证', 'date' => $s['health_cert_expiry'], 'days' => $info['health']['days'], 'state' => $info['health']['state']);
            }
            if ($info['id']['state'] === 'expired' || $info['id']['state'] === 'soon') {
                $expiring[] = array('id' => $s['id'], 'name' => $s['name'], 'position' => normalize_position($s['position']), 'type' => '身份证', 'date' => $s['id_card_expiry'], 'days' => $info['id']['days'], 'state' => $info['id']['state']);
            }
        }
    }
    usort($pendingList, function ($a, $b) { return $b['waitedHours'] - $a['waitedHours']; });
    usort($expiring, function ($a, $b) { return $a['days'] - $b['days']; });

    $salaryEntered = 0;
    $salaryPublished = 0;
    $scoreEntered = 0;
    $scorePublished = 0;
    foreach ($staffRows as $s) {
        if ($s['status'] !== 'active') continue;
        $sal = salary_row($s['id'], $cur);
        if ($sal) $salaryEntered++; /* 已录入即计入，全 0 记录同样算已录入 */
        if ($sal && ($sal['pay_status'] === 'published' || $sal['pay_status'] === 'paid')) $salaryPublished++;
        $sc = score_row($s['id'], $cur);
        if ($sc) $scoreEntered++;
        if ($sc && $sc['status'] === 'published') $scorePublished++;
    }

    $st = db()->prepare("SELECT COUNT(*) FROM leaves WHERE status = 'pending'");
    $st->execute();
    $pendingLeaves = (int)$st->fetchColumn();
    $st = db()->prepare("SELECT COUNT(*) FROM leaves WHERE status = 'approved' AND cancel_requested = 1");
    $st->execute();
    $cancelLeaves = (int)$st->fetchColumn();
    $st = db()->prepare("SELECT COUNT(*) FROM corrections WHERE status = 'pending'");
    $st->execute();
    $correctionCount = (int)$st->fetchColumn();

    $st = db()->prepare("SELECT c.*, s.name FROM corrections c LEFT JOIN staff s ON s.id = c.staff_id WHERE c.status = 'pending' ORDER BY c.created_at DESC LIMIT 10");
    $st->execute();
    $corrections = array();
    foreach ($st->fetchAll() as $c) {
        $corrections[] = array(
            'id' => $c['id'], 'staffId' => $c['staff_id'], 'staffName' => $c['name'] ? $c['name'] : '',
            'fieldLabel' => $c['field_label'], 'newValue' => $c['new_value'], 'createdAt' => iso($c['created_at'])
        );
    }

    return array(
        'month' => $cur,
        'pending' => array('count' => count($pendingList), 'list' => $pendingList, 'overdue' => count(array_filter($pendingList, function ($p) { return $p['waitedHours'] > 24; }))),
        'expiry' => array(
            'count' => count(array_filter($expiring, function ($e) { return $e['state'] === 'soon'; })),
            'expired' => count(array_filter($expiring, function ($e) { return $e['state'] === 'expired'; })),
            'list' => $expiring
        ),
        'salary' => array('entered' => $salaryEntered, 'published' => $salaryPublished, 'total' => $activeCount),
        'score' => array('entered' => $scoreEntered, 'published' => $scorePublished, 'total' => $activeCount),
        'leaves' => array('pending' => $pendingLeaves, 'cancel' => $cancelLeaves, 'list' => $pendingLeaves),
        'corrections' => array('count' => $correctionCount, 'list' => $corrections),
        'staffTotals' => array('active' => $activeCount, 'pending' => $pendingCount, 'resigned' => $resignedCount, 'total' => count($staffRows))
    );
}

function api_settings_get($in)
{
    require_login();
    return settings_data();
}

function api_settings_save($in)
{
    require_super();
    $settings = settings_data();
    $patch = isset($in['patch']) && is_array($in['patch']) ? $in['patch'] : $in;

    if (isset($patch['restRules']) && is_array($patch['restRules'])) {
        $rules = $settings['restRules'];
        foreach (array('fullTime', 'partTime', 'hourly') as $k) {
            if (isset($patch['restRules'][$k])) $rules[$k] = max(0, min(31, (float)$patch['restRules'][$k]));
        }
        foreach (array('maxPerPosition', 'maxPerDay', 'maxConsecutive', 'reviewHours') as $k) {
            if (isset($patch['restRules'][$k])) $rules[$k] = max(0, min(365, (int)$patch['restRules'][$k]));
        }
        $settings['restRules'] = $rules;
    }
    if (isset($patch['expiry']) && is_array($patch['expiry'])) {
        $expiry = $settings['expiry'];
        foreach (array('healthCert', 'idCard') as $k) {
            if (isset($patch['expiry'][$k])) $expiry[$k] = max(0, min(3650, (int)$patch['expiry'][$k]));
        }
        $settings['expiry'] = $expiry;
    }
    if (isset($patch['noticeText'])) $settings['noticeText'] = str_limit((string)$patch['noticeText'], 4000);
    if (isset($patch['healthDisclosure']) && is_array($patch['healthDisclosure'])) {
        $hd = $settings['healthDisclosure'];
        if (isset($patch['healthDisclosure']['enabled'])) $hd['enabled'] = !empty($patch['healthDisclosure']['enabled']);
        if (isset($patch['healthDisclosure']['fullName'])) $hd['fullName'] = !empty($patch['healthDisclosure']['fullName']);
        $settings['healthDisclosure'] = $hd;
    }
    if (isset($patch['feishuWebhook']) && is_array($patch['feishuWebhook'])) {
        $settings['feishuWebhook'] = feishu_webhook_from_input(
            $patch['feishuWebhook'],
            isset($settings['feishuWebhook']) ? $settings['feishuWebhook'] : array()
        );
    }
    if (isset($patch['personalWebhook']) && is_array($patch['personalWebhook'])) {
        $settings['personalWebhook'] = personal_webhook_from_input(
            $patch['personalWebhook'],
            isset($settings['personalWebhook']) ? $settings['personalWebhook'] : array()
        );
    }
    if (isset($patch['birthdayCare']) && is_array($patch['birthdayCare'])) {
        $bc = isset($settings['birthdayCare']) && is_array($settings['birthdayCare'])
            ? $settings['birthdayCare'] : array('enabled' => true, 'template' => '');
        if (array_key_exists('enabled', $patch['birthdayCare'])) $bc['enabled'] = !empty($patch['birthdayCare']['enabled']);
        if (isset($patch['birthdayCare']['template'])) $bc['template'] = str_limit((string)$patch['birthdayCare']['template'], 1000);
        $settings['birthdayCare'] = $bc;
    }
    /* 站点标题：空串表示未配置，读取时回退默认标题 */
    if (array_key_exists('shiftReminder', $patch)) {
        $sr = preg_replace('/\s+/u', ' ', trim((string)$patch['shiftReminder']));
        if ($sr === null) $sr = trim((string)$patch['shiftReminder']);
        $settings['shiftReminder'] = str_limit($sr, 200);
    }
    if (array_key_exists('siteTitle', $patch)) {        $title = preg_replace('/\s+/u', ' ', trim((string)$patch['siteTitle']));
        if ($title === null) $title = trim((string)$patch['siteTitle']);
        $settings['siteTitle'] = str_limit($title, 40);
    }
    if (isset($patch['grades']) && is_array($patch['grades'])) {
        $grades = array();
        foreach ($patch['grades'] as $g) {
            $key = isset($g['key']) ? str_limit((string)$g['key'], 4) : '';
            if ($key === '') continue;
            $grades[] = array(
                'key' => $key,
                'min' => isset($g['min']) ? max(0, min(100, (float)$g['min'])) : 0,
                'coef' => isset($g['coef']) ? (float)$g['coef'] : 1,
                'desc' => isset($g['desc']) ? str_limit((string)$g['desc'], 40) : ''
            );
        }
        if ($grades) $settings['grades'] = $grades;
    }

    save_settings_data($settings);
    audit_log('保存系统设置', '系统设置', implode('、', array_keys($patch)));
    return array('ok' => true);
}

function api_backup_export($in)
{
    require_super();
    $staff = array();
    foreach (db()->query('SELECT * FROM staff ORDER BY id')->fetchAll() as $s) {
        $staff[] = staff_out($s);
    }
    $accounts = array();
    foreach (db()->query('SELECT * FROM accounts ORDER BY id')->fetchAll() as $a) {
        $item = account_out($a);
        $item['passwordHash'] = $a['password_hash'];
        $accounts[] = $item;
    }
    $salaries = array();
    foreach (db()->query('SELECT * FROM salaries ORDER BY month, staff_id')->fetchAll() as $r) {
        $salaries[] = salary_out($r);
    }
    $scores = array();
    foreach (db()->query('SELECT * FROM scores ORDER BY month, staff_id')->fetchAll() as $r) {
        $scores[] = score_out($r);
    }
    $leaves = array();
    foreach (db()->query('SELECT * FROM leaves ORDER BY date, id')->fetchAll() as $r) {
        $leaves[] = leave_out($r);
    }
    $shifts = array();
    foreach (db()->query('SELECT * FROM shift_requests ORDER BY month, id')->fetchAll() as $r) {
        $shifts[] = shift_out($r);
    }
    $notices = array();
    foreach (db()->query('SELECT * FROM notices ORDER BY created_at ASC')->fetchAll() as $r) {
        $item = notice_out($r);
        $item['publisherId'] = $r['publisher_id'];
        $notices[] = $item;
    }
    $noticeReads = array();
    foreach (db()->query('SELECT * FROM notice_reads ORDER BY id ASC')->fetchAll() as $r) {
        $noticeReads[] = array('noticeId' => $r['notice_id'], 'staffId' => $r['staff_id'], 'readAt' => iso($r['read_at']));
    }
    $schedules = array();
    $scheduleParts = array();
    foreach (db()->query('SELECT schedule_id, staff_id FROM schedule_participants')->fetchAll() as $r) {
        $scheduleParts[(string)$r['schedule_id']][] = (string)$r['staff_id'];
    }
    foreach (db()->query('SELECT * FROM schedules ORDER BY schedule_date ASC, start_time ASC, id ASC')->fetchAll() as $r) {
        $schedules[] = array(
            'id' => $r['id'], 'staffId' => $r['staff_id'], 'title' => $r['title'],
            'date' => $r['schedule_date'],
            'startTime' => substr((string)$r['start_time'], 0, 5),
            'endTime' => $r['end_time'] ? substr((string)$r['end_time'], 0, 5) : '',
            'location' => $r['location'], 'remark' => $r['remark'],
            'remindMinutes' => (int)$r['remind_minutes'], 'status' => $r['status'],
            'participantIds' => isset($scheduleParts[(string)$r['id']]) ? $scheduleParts[(string)$r['id']] : array(),
            'createdAt' => iso($r['created_at']), 'updatedAt' => iso($r['updated_at'])
        );
    }
    $taskTemplates = array();
    foreach (db()->query('SELECT * FROM task_templates ORDER BY created_at ASC, id ASC')->fetchAll() as $r) {
        $taskTemplates[] = task_template_out($r);
    }
    $taskInstances = array();
    foreach (db()->query('SELECT * FROM task_instances ORDER BY id ASC')->fetchAll() as $r) {
        $taskInstances[] = array(
            'id' => (int)$r['id'],
            'templateId' => $r['template_id'],
            'periodDate' => $r['period_date'],
            'status' => $r['status'],
            'submitterId' => $r['submitter_id'] ? $r['submitter_id'] : '',
            'submitterName' => $r['submitter_name'],
            'submittedAt' => iso($r['submitted_at']),
            'images' => array_values(json_field($r['images_json'], array())),
            'reviewedBy' => $r['reviewed_by'],
            'reviewerId' => $r['reviewer_id'] ? $r['reviewer_id'] : '',
            'reviewedAt' => iso($r['reviewed_at']),
            'rejectReason' => $r['reject_reason'],
            'createdAt' => iso($r['created_at']),
            'updatedAt' => iso($r['updated_at'])
        );
    }
    $attendance = array();
    foreach (db()->query('SELECT * FROM attendance ORDER BY month, staff_id')->fetchAll() as $r) {
        $attendance[] = array(
            'staffId' => $r['staff_id'], 'month' => $r['month'],
            'shouldRestDays' => (float)$r['should_rest_days'], 'actualWorkDays' => (float)$r['actual_work_days'],
            'remark' => $r['remark'], 'updatedBy' => $r['updated_by'], 'updatedAt' => iso($r['updated_at'])
        );
    }
    $attendanceDaily = array();
    try {
        foreach (db()->query('SELECT * FROM attendance_daily ORDER BY work_date ASC, staff_id ASC, segment_no ASC')->fetchAll() as $r) {
            $attendanceDaily[] = array(
                'id' => $r['id'], 'staffId' => $r['staff_id'], 'workDate' => $r['work_date'],
                'segmentNo' => (int)$r['segment_no'], 'empNo' => $r['emp_no'], 'staffName' => $r['staff_name'],
                'storeCode' => $r['store_code'], 'storeName' => $r['store_name'], 'position' => $r['position'],
                'employmentType' => $r['employment_type'], 'scheduleType' => $r['schedule_type'],
                'plannedIn' => attendance_daily_time($r['planned_in']), 'plannedOut' => attendance_daily_time($r['planned_out']),
                'plannedHours' => (float)$r['planned_hours'], 'mealHours' => (float)$r['meal_hours'],
                'plannedWorkHours' => (float)$r['planned_work_hours'],
                'clockIn' => attendance_daily_time($r['clock_in']), 'clockOut' => attendance_daily_time($r['clock_out']),
                'confirmIn' => attendance_daily_time($r['confirm_in']), 'confirmOut' => attendance_daily_time($r['confirm_out']),
                'confirmMealHours' => (float)$r['confirm_meal_hours'], 'actualHours' => (float)$r['actual_hours'],
                'hourDiff' => (float)$r['hour_diff'], 'managerConfirm' => $r['manager_confirm'],
                'employeeConfirm' => $r['employee_confirm'], 'importedBy' => $r['imported_by'],
                'importedAt' => iso($r['imported_at'])
            );
        }
    } catch (Exception $e) { /* 旧库未迁移时忽略 */ }

    $shiftStations = array();
    $dailyShifts = array();
    try {
        foreach (db()->query('SELECT * FROM shift_stations ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
            $shiftStations[] = daily_shift_station_out($r);
        }
        foreach (db()->query('SELECT * FROM daily_shifts ORDER BY work_date ASC, staff_id ASC, segment_no ASC')->fetchAll() as $r) {
            $dailyShifts[] = daily_shift_out($r);
        }
    } catch (Exception $e) { /* 旧库未迁移时忽略 */ }
    $corrections = array();
    foreach (db()->query('SELECT * FROM corrections ORDER BY created_at DESC')->fetchAll() as $c) {
        $corrections[] = array(
            'id' => $c['id'], 'staffId' => $c['staff_id'], 'field' => $c['field'], 'fieldLabel' => $c['field_label'],
            'oldValue' => $c['old_value'], 'newValue' => $c['new_value'], 'note' => $c['note'],
            'status' => $c['status'], 'createdAt' => iso($c['created_at']), 'reviewedBy' => $c['reviewed_by'],
            'reviewedAt' => iso($c['reviewed_at']), 'rejectReason' => $c['reject_reason']
        );
    }
    $logs = array();
    foreach (db()->query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5000')->fetchAll() as $l) {
        $logs[] = array('time' => iso($l['time']), 'operator' => $l['operator'], 'role' => $l['role'], 'target' => $l['target'], 'action' => $l['action'], 'detail' => $l['detail']);
    }

    $reimburseCategories = array();
    foreach (db()->query('SELECT * FROM reimburse_categories ORDER BY sort_order ASC, created_at ASC')->fetchAll() as $r) {
        $reimburseCategories[] = reimburse_category_out($r);
    }
    $reimbursePayees = array();
    foreach (db()->query('SELECT * FROM staff_payees ORDER BY created_at ASC')->fetchAll() as $r) {
        $reimbursePayees[] = array(
            'id' => $r['id'], 'staffId' => $r['staff_id'], 'type' => $r['type'],
            'account' => $r['account'], 'bankName' => $r['bank_name'], 'holderName' => $r['holder_name'],
            'isDefault' => (bool)$r['is_default'],
            'createdAt' => iso($r['created_at']), 'updatedAt' => iso($r['updated_at'])
        );
    }
    $reimburseClaims = array();
    foreach (db()->query('SELECT * FROM reimburse_claims ORDER BY created_at ASC')->fetchAll() as $r) {
        $item = claim_out($r);
        $item['attachments'] = json_field($r['attachments_json'], array());
        $reimburseClaims[] = $item;
    }

    $healthVerifications = array();
    foreach (db()->query('SELECT * FROM health_cert_verifications ORDER BY verified_at ASC, created_at ASC')->fetchAll() as $r) {
        $healthVerifications[] = array(
            'id' => $r['id'], 'staffId' => $r['staff_id'], 'certKey' => $r['cert_key'],
            'result' => $r['result'], 'remark' => $r['remark'],
            'materialKey' => $r['material_key'], 'materialName' => $r['material_name'],
            'verifiedBy' => $r['verified_by'], 'verifiedByName' => $r['verified_name'],
            'verifiedAt' => iso($r['verified_at'])
        );
    }

    $feedbacks = array();
    $feedbackReplies = array();
    try {
        foreach (db()->query('SELECT * FROM feedbacks ORDER BY created_at ASC, id ASC')->fetchAll() as $r) {
            $feedbacks[] = array(
                'id' => $r['id'], 'staffId' => $r['staff_id'], 'content' => $r['content'],
                'lastAt' => iso($r['last_at']), 'createdAt' => iso($r['created_at']), 'updatedAt' => iso($r['updated_at'])
            );
        }
        foreach (db()->query('SELECT * FROM feedback_replies ORDER BY created_at ASC, id ASC')->fetchAll() as $r) {
            $feedbackReplies[] = array(
                'id' => $r['id'], 'feedbackId' => $r['feedback_id'], 'authorRole' => $r['author_role'],
                'authorStaffId' => $r['author_staff_id'], 'content' => $r['content'], 'createdAt' => iso($r['created_at'])
            );
        }
    } catch (Exception $e) { /* 旧库未迁移时忽略 */ }

    $birthdayGreetings = array();
    try {
        foreach (db()->query('SELECT * FROM birthday_greetings ORDER BY year ASC, staff_id ASC')->fetchAll() as $r) {
            $birthdayGreetings[] = array(
                'staffId' => $r['staff_id'], 'year' => (int)$r['year'], 'createdAt' => iso($r['created_at'])
            );
        }
    } catch (Exception $e) { /* 旧库未迁移时忽略 */ }

    $expiryCategories = array();
    $expiryMaterials = array();
    $expiryRecords = array();
    try {
        foreach (db()->query('SELECT * FROM expiry_categories ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
            $expiryCategories[] = expiry_category_out($r);
        }
        foreach (db()->query('SELECT * FROM expiry_materials ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
            $expiryMaterials[] = expiry_material_out($r);
        }
        foreach (db()->query('SELECT * FROM expiry_records ORDER BY check_date ASC, due_at ASC')->fetchAll() as $r) {
            $expiryRecords[] = expiry_record_out($r);
        }
    } catch (Exception $e) { /* 旧库未迁移时忽略 */ }

    $payload = array(
        '_meta' => array(
            'app' => '塔斯汀门店人员管理系统',
            'store' => store_info(),
            'exportedAt' => date('c'),
            'note' => '备份包含业务数据与账号密码散列，不包含 uploads 目录中的附件原文件，请同时备份该目录。'
        ),
        'version' => 1,
        'store' => store_info(),
        'settings' => settings_data(),
        'accounts' => $accounts,
        'staff' => $staff,
        'salaries' => $salaries,
        'scores' => $scores,
        'leaves' => $leaves,
        'shifts' => $shifts,
        'notices' => $notices,
        'noticeReads' => $noticeReads,
        'schedules' => $schedules,
        'taskTemplates' => $taskTemplates,
        'taskInstances' => $taskInstances,
        'attendance' => $attendance,
        'attendanceDaily' => $attendanceDaily,
        'shiftStations' => $shiftStations,
        'dailyShifts' => $dailyShifts,
        'corrections' => $corrections,
        'healthVerifications' => $healthVerifications,
        'auditLogs' => $logs,
        'reimburseCategories' => $reimburseCategories,
        'reimbursePayees' => $reimbursePayees,
        'reimburseClaims' => $reimburseClaims,
        'feedbacks' => $feedbacks,
        'feedbackReplies' => $feedbackReplies,
        'birthdayGreetings' => $birthdayGreetings,
        'expiryCategories' => $expiryCategories,
        'expiryMaterials' => $expiryMaterials,
        'expiryRecords' => $expiryRecords
    );
    audit_log('导出备份', '全量数据', '共 ' . count($staff) . ' 份档案');
    return array('json' => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), 'count' => count($staff));
}

function dt_in($v)
{
    if (!$v) return null;
    $s = str_replace('T', ' ', (string)$v);
    $s = preg_replace('/\.\d+/', '', $s);
    $s = preg_replace('/[Z\+\-]\d{2}:?\d{2}$/', '', $s);
    return substr($s, 0, 19);
}

function date_in($v)
{
    if (!$v) return null;
    return substr((string)$v, 0, 10);
}

function api_backup_restore($in)
{
    require_super();
    $text = isset($in['json']) ? (string)$in['json'] : '';
    $data = json_decode($text, true);
    if (!is_array($data)) throw new ApiException('文件格式不正确，请选择本系统导出的 JSON 备份文件');
    if (empty($data['staff']) || empty($data['accounts'])) throw new ApiException('备份文件缺少必要数据，无法恢复');

    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach (array('expiry_records', 'expiry_materials', 'expiry_categories', 'feedback_replies', 'feedbacks', 'birthday_greetings', 'health_cert_verifications', 'reimburse_claims', 'staff_payees', 'reimburse_categories', 'schedule_participants', 'schedules', 'task_instances', 'task_templates', 'salaries', 'scores', 'leaves', 'shift_requests', 'notice_reads', 'notices', 'daily_shifts', 'attendance_daily', 'attendance', 'corrections', 'audit_logs', 'accounts', 'staff', 'login_locks') as $t) {
            $pdo->exec('DELETE FROM ' . $t);
        }

        $staffCols = array('id', 'name', 'gender', 'id_card', 'birth', 'phone', 'address', 'position', 'employment_type', 'hire_date', 'id_card_expiry', 'health_cert_expiry', 'emergency', 'emp_no', 'status', 'remark', 'files_json', 'created_at', 'updated_at', 'submitted_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'resign_date', 'resign_reason', 'handover');
        $staffSql = 'INSERT INTO staff (' . implode(',', $staffCols) . ') VALUES (' . implode(',', array_fill(0, count($staffCols), '?')) . ')';
        foreach ($data['staff'] as $s) {
            $files = isset($s['files']) ? $s['files'] : array();
            $vals = array(
                $s['id'], $s['name'], isset($s['gender']) ? $s['gender'] : '男',
                isset($s['idCard']) && $s['idCard'] !== '' ? $s['idCard'] : null,
                date_in(isset($s['birth']) ? $s['birth'] : ''),
                isset($s['phone']) ? $s['phone'] : '', isset($s['address']) ? $s['address'] : '',
                normalize_position(isset($s['position']) ? $s['position'] : '店员'),
                isset($s['employmentType']) ? $s['employmentType'] : '全职',
                date_in(isset($s['hireDate']) ? $s['hireDate'] : ''),
                date_in(isset($s['idCardExpiry']) ? $s['idCardExpiry'] : ''),
                date_in(isset($s['healthCertExpiry']) ? $s['healthCertExpiry'] : ''),
                isset($s['emergency']) ? $s['emergency'] : '',
                isset($s['empNo']) && $s['empNo'] !== '' ? $s['empNo'] : null,
                isset($s['status']) ? $s['status'] : 'pending',
                isset($s['remark']) ? $s['remark'] : '',
                json_encode(is_array($files) ? $files : array(), JSON_UNESCAPED_UNICODE),
                dt_in(isset($s['createdAt']) ? $s['createdAt'] : '') ?: now_dt(),
                dt_in(isset($s['updatedAt']) ? $s['updatedAt'] : '') ?: now_dt(),
                dt_in(isset($s['submittedAt']) ? $s['submittedAt'] : ''),
                isset($s['reviewedBy']) ? $s['reviewedBy'] : '',
                dt_in(isset($s['reviewedAt']) ? $s['reviewedAt'] : ''),
                isset($s['rejectReason']) ? $s['rejectReason'] : '',
                date_in(isset($s['resignDate']) ? $s['resignDate'] : ''),
                isset($s['resignReason']) ? $s['resignReason'] : '',
                isset($s['handover']) ? $s['handover'] : ''
            );
            $st = $pdo->prepare($staffSql);
            $st->execute($vals);
        }

        $accCols = array('id', 'phone', 'name', 'role', 'staff_id', 'status', 'password_hash', 'first_login', 'created_at', 'last_login_at');
        $accSql = 'INSERT INTO accounts (' . implode(',', $accCols) . ') VALUES (' . implode(',', array_fill(0, count($accCols), '?')) . ')';
        foreach ($data['accounts'] as $a) {
            $hash = isset($a['passwordHash']) ? $a['passwordHash'] : '';
            if ($hash === '' || strpos($hash, '$2') !== 0) {
                throw new ApiException('备份中的账号密码散列无效，无法恢复');
            }
            $vals = array(
                $a['id'], $a['phone'], $a['name'], isset($a['role']) ? $a['role'] : 'staff',
                $a['staffId'], isset($a['status']) ? $a['status'] : 'active', $hash,
                !empty($a['firstLogin']) ? 1 : 0,
                dt_in(isset($a['createdAt']) ? $a['createdAt'] : '') ?: now_dt(),
                dt_in(isset($a['lastLoginAt']) ? $a['lastLoginAt'] : '')
            );
            $st = $pdo->prepare($accSql);
            $st->execute($vals);
        }

        $catSql = 'INSERT IGNORE INTO reimburse_categories (id, name, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)';
        foreach ((isset($data['reimburseCategories']) ? $data['reimburseCategories'] : array()) as $r) {
            $st = $pdo->prepare($catSql);
            $st->execute(array(
                $r['id'], $r['name'], isset($r['sortOrder']) ? (int)$r['sortOrder'] : 0,
                !empty($r['enabled']) ? 1 : 0,
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        }

        $payeeSql = 'INSERT IGNORE INTO staff_payees (id, staff_id, type, account, bank_name, holder_name, is_default, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['reimbursePayees']) ? $data['reimbursePayees'] : array()) as $r) {
            if (isset($r['staffId']) && !staff_by_id($r['staffId'])) continue;
            $st = $pdo->prepare($payeeSql);
            $st->execute(array(
                $r['id'], $r['staffId'], isset($r['type']) && $r['type'] === 'bank' ? 'bank' : 'alipay',
                isset($r['account']) ? $r['account'] : '',
                isset($r['bankName']) ? $r['bankName'] : '',
                isset($r['holderName']) ? $r['holderName'] : '',
                !empty($r['isDefault']) ? 1 : 0,
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        }

        $claimSql = 'INSERT IGNORE INTO reimburse_claims (id, staff_id, staff_name, category_id, category_name, amount, reason, attachments_json, payee_type, payee_account, payee_bank, payee_holder, status, reviewer_id, reviewed_by, reviewed_at, reject_reason, paid_by, paid_at, created_at, updated_at) VALUES (' . implode(',', array_fill(0, 21, '?')) . ')';
        foreach ((isset($data['reimburseClaims']) ? $data['reimburseClaims'] : array()) as $r) {
            if (!isset($r['staffId']) || !staff_by_id($r['staffId'])) continue;
            $rid = isset($r['reviewerId']) ? $r['reviewerId'] : '';
            if ($rid !== '' && !staff_by_id($rid)) $rid = null;
            $status = isset($r['status']) ? $r['status'] : 'pending';
            if (!in_array($status, array('pending', 'approved', 'rejected', 'paid'), true)) $status = 'pending';
            $st = $pdo->prepare($claimSql);
            $st->execute(array(
                $r['id'], $r['staffId'], isset($r['staffName']) ? $r['staffName'] : '',
                isset($r['categoryId']) ? $r['categoryId'] : '', isset($r['categoryName']) ? $r['categoryName'] : '',
                isset($r['amount']) ? (float)$r['amount'] : 0,
                isset($r['reason']) ? $r['reason'] : '',
                json_encode(isset($r['attachments']) && is_array($r['attachments']) ? $r['attachments'] : array(), JSON_UNESCAPED_UNICODE),
                isset($r['payeeType']) ? $r['payeeType'] : '', isset($r['payeeAccount']) ? $r['payeeAccount'] : '',
                isset($r['payeeBank']) ? $r['payeeBank'] : '', isset($r['payeeHolder']) ? $r['payeeHolder'] : '',
                $status, $rid, isset($r['reviewedBy']) ? $r['reviewedBy'] : '',
                dt_in(isset($r['reviewedAt']) ? $r['reviewedAt'] : ''),
                isset($r['rejectReason']) ? $r['rejectReason'] : '',
                isset($r['paidBy']) ? $r['paidBy'] : '',
                dt_in(isset($r['paidAt']) ? $r['paidAt'] : ''),
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        }

        if (empty($data['reimburseCategories'])) reimburse_seed_default_categories();

        $salaryCols = array('id', 'staff_id', 'month', 'should_days', 'actual_days', 'total_hours', 'base_salary', 'post_allowance', 'performance_pay', 'full_attendance', 'daily_overtime_pay', 'statutory_holiday_pay', 'meal_subsidy', 'transport_subsidy', 'attendance_subsidy', 'social_subsidy', 'commission', 'gross_pay', 'inventory_deduction', 'late_deduction', 'attendance_diff', 'leave_deduction', 'discipline_deduction', 'discipline_reason', 'other_deduction', 'other_reason', 'insurance', 'tax', 'deduction_total', 'net_pay', 'pay_status', 'pay_date', 'publish_at', 'published_by', 'hidden', 'remark', 'updated_by', 'updated_at');
        $salarySql = 'INSERT INTO salaries (' . implode(',', $salaryCols) . ') VALUES (' . implode(',', array_fill(0, count($salaryCols), '?')) . ')';
        foreach ((isset($data['salaries']) ? $data['salaries'] : array()) as $r) {
            $val = function ($k, $def = 0) use ($r) {
                return isset($r[$k]) && $r[$k] !== '' ? (float)$r[$k] : $def;
            };
            $vals = array(
                $r['id'], $r['staffId'], $r['month'],
                $val('shouldDays', 26), $val('actualDays', 0), $val('totalHours', 0),
                $val('baseSalary'), $val('postAllowance'), $val('performancePay'), $val('fullAttendance'),
                $val('dailyOvertimePay'), $val('statutoryHolidayPay'), $val('mealSubsidy'),
                $val('transportSubsidy'), $val('attendanceSubsidy'), $val('socialSubsidy'),
                $val('commission'), $val('grossPay'), $val('inventoryDeduction'), $val('lateDeduction'),
                $val('attendanceDiff'), $val('leaveDeduction'), $val('disciplineDeduction'),
                isset($r['disciplineReason']) ? $r['disciplineReason'] : '',
                $val('otherDeduction'), isset($r['otherReason']) ? $r['otherReason'] : '',
                $val('insurance'), $val('tax'), $val('deductionTotal'), $val('netPay'),
                isset($r['payStatus']) ? $r['payStatus'] : 'draft',
                date_in(isset($r['payDate']) ? $r['payDate'] : ''),
                dt_in(isset($r['publishAt']) ? $r['publishAt'] : ''),
                isset($r['publishedBy']) ? $r['publishedBy'] : '',
                !empty($r['hidden']) ? 1 : 0,
                isset($r['remark']) ? $r['remark'] : '',
                isset($r['updatedBy']) ? $r['updatedBy'] : '',
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            );
            $st = $pdo->prepare($salarySql);
            $st->execute($vals);
        }

        $scoreCols = array('id', 'staff_id', 'month', 'dims_json', 'adjust_json', 'total', 'grade', 'status', 'publish_at', 'published_by', 'updated_by', 'updated_at');
        $scoreSql = 'INSERT INTO scores (' . implode(',', $scoreCols) . ') VALUES (' . implode(',', array_fill(0, count($scoreCols), '?')) . ')';
        foreach ((isset($data['scores']) ? $data['scores'] : array()) as $r) {
            $st = $pdo->prepare($scoreSql);
            $st->execute(array(
                $r['id'], $r['staffId'], $r['month'],
                json_encode(isset($r['dims']) ? $r['dims'] : array(), JSON_UNESCAPED_UNICODE),
                json_encode(isset($r['adjust']) ? $r['adjust'] : array(), JSON_UNESCAPED_UNICODE),
                isset($r['total']) ? (float)$r['total'] : 0,
                isset($r['grade']) ? $r['grade'] : 'D',
                isset($r['status']) ? $r['status'] : 'draft',
                dt_in(isset($r['publishAt']) ? $r['publishAt'] : ''),
                isset($r['publishedBy']) ? $r['publishedBy'] : '',
                isset($r['updatedBy']) ? $r['updatedBy'] : '',
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }

        $leaveCols = array('id', 'staff_id', 'date', 'type', 'reason', 'status', 'manual', 'created_at', 'updated_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'cancel_requested', 'cancel_requested_at', 'force_reason');
        $leaveSql = 'INSERT INTO leaves (' . implode(',', $leaveCols) . ') VALUES (' . implode(',', array_fill(0, count($leaveCols), '?')) . ')';
        foreach ((isset($data['leaves']) ? $data['leaves'] : array()) as $r) {
            $st = $pdo->prepare($leaveSql);
            $st->execute(array(
                $r['id'], $r['staffId'], $r['date'], isset($r['type']) ? $r['type'] : '事假',
                isset($r['reason']) ? $r['reason'] : '', isset($r['status']) ? $r['status'] : 'pending',
                !empty($r['manual']) ? 1 : 0,
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : ''),
                isset($r['reviewedBy']) ? $r['reviewedBy'] : '',
                dt_in(isset($r['reviewedAt']) ? $r['reviewedAt'] : ''),
                isset($r['rejectReason']) ? $r['rejectReason'] : '',
                !empty($r['cancelRequested']) ? 1 : 0,
                dt_in(isset($r['cancelRequestedAt']) ? $r['cancelRequestedAt'] : ''),
                isset($r['forceReason']) ? $r['forceReason'] : ''
            ));
        }

        $shiftCols = array('id', 'staff_id', 'month', 'slots_json', 'note', 'status', 'created_at', 'updated_at', 'reviewed_by', 'reviewed_at', 'reject_reason', 'cancel_requested', 'cancel_requested_at');
        $shiftSql = 'INSERT INTO shift_requests (' . implode(',', $shiftCols) . ') VALUES (' . implode(',', array_fill(0, count($shiftCols), '?')) . ')';
        foreach ((isset($data['shifts']) ? $data['shifts'] : array()) as $r) {
            $st = $pdo->prepare($shiftSql);
            $st->execute(array(
                $r['id'], $r['staffId'], $r['month'],
                json_encode(isset($r['slots']) ? $r['slots'] : array(), JSON_UNESCAPED_UNICODE),
                isset($r['note']) ? $r['note'] : '',
                isset($r['status']) ? $r['status'] : 'pending',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : ''),
                isset($r['reviewedBy']) ? $r['reviewedBy'] : '',
                dt_in(isset($r['reviewedAt']) ? $r['reviewedAt'] : ''),
                isset($r['rejectReason']) ? $r['rejectReason'] : '',
                !empty($r['cancelRequested']) ? 1 : 0,
                dt_in(isset($r['cancelRequestedAt']) ? $r['cancelRequestedAt'] : '')
            ));
        }

        $noticeCols = array('id', 'category', 'title', 'body', 'status', 'pinned', 'important', 'publisher', 'publisher_id', 'publish_at', 'published_at', 'created_at', 'updated_at');
        $noticeSql = 'INSERT INTO notices (' . implode(',', $noticeCols) . ') VALUES (' . implode(',', array_fill(0, count($noticeCols), '?')) . ')';
        foreach ((isset($data['notices']) ? $data['notices'] : array()) as $r) {
            $st = $pdo->prepare($noticeSql);
            $st->execute(array(
                $r['id'], $r['category'], $r['title'], $r['body'],
                isset($r['status']) ? $r['status'] : 'published',
                !empty($r['pinned']) ? 1 : 0, !empty($r['important']) ? 1 : 0,
                isset($r['publisher']) ? $r['publisher'] : '',
                isset($r['publisherId']) ? $r['publisherId'] : null,
                dt_in(isset($r['publishAt']) ? $r['publishAt'] : ''),
                dt_in(isset($r['publishedAt']) ? $r['publishedAt'] : ''),
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        }
        foreach ((isset($data['noticeReads']) ? $data['noticeReads'] : array()) as $r) {
            $st = $pdo->prepare('INSERT IGNORE INTO notice_reads (notice_id, staff_id, read_at) VALUES (?,?,?)');
            $st->execute(array($r['noticeId'], $r['staffId'], dt_in(isset($r['readAt']) ? $r['readAt'] : '') ?: now_dt()));
        }

        $schSql = 'INSERT INTO schedules (id, staff_id, title, schedule_date, start_time, end_time, location, remark, remind_minutes, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['schedules']) ? $data['schedules'] : array()) as $r) {
            if (empty($r['staffId']) || empty($r['id']) || empty($r['date']) || empty($r['startTime'])) continue;
            $st = $pdo->prepare($schSql);
            $st->execute(array(
                $r['id'], $r['staffId'], isset($r['title']) ? $r['title'] : '',
                date_in($r['date']),
                strlen($r['startTime']) === 5 ? $r['startTime'] . ':00' : $r['startTime'],
                !empty($r['endTime']) ? (strlen($r['endTime']) === 5 ? $r['endTime'] . ':00' : $r['endTime']) : null,
                isset($r['location']) ? $r['location'] : '',
                isset($r['remark']) ? $r['remark'] : '',
                isset($r['remindMinutes']) ? (int)$r['remindMinutes'] : 0,
                isset($r['status']) && in_array($r['status'], array('active', 'cancelled'), true) ? $r['status'] : 'active',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
            if (!empty($r['participantIds']) && is_array($r['participantIds'])) {
                $insPart = $pdo->prepare('INSERT IGNORE INTO schedule_participants (schedule_id, staff_id, created_at) VALUES (?,?,?)');
                foreach ($r['participantIds'] as $pid) {
                    if ($pid === '' || !staff_by_id($pid)) continue;
                    $insPart->execute(array($r['id'], $pid, now_dt()));
                }
            }
        }

        $tplRows = isset($data['taskTemplates']) ? $data['taskTemplates'] : array();
        $topRows = array();
        $childRows = array();
        foreach ($tplRows as $r) {
            $pid = isset($r['parentId']) ? (string)$r['parentId'] : '';
            if ($pid !== '') $childRows[] = $r; else $topRows[] = $r;
        }
        $tplSql = 'INSERT IGNORE INTO task_templates (id, title, content, parent_id, cycle, kind, weekdays, month_day, start_date, end_date, store_codes, sample_images_json, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        $insertTpl = function ($r, $parentId) use ($pdo, $tplSql) {
            $cycle = isset($r['cycle']) ? $r['cycle'] : 'once';
            if (!array_key_exists($cycle, task_cycles())) $cycle = 'once';
            $weekdays = isset($r['weekdays']) && is_array($r['weekdays']) ? implode(',', $r['weekdays']) : (isset($r['weekdays']) ? $r['weekdays'] : '');
            $sampleImages = task_clean_sample_images(isset($r['sampleImages']) ? $r['sampleImages'] : array());
            $kind = isset($r['kind']) && $r['kind'] === 'reminder' ? 'reminder' : 'task';
            $st = $pdo->prepare($tplSql);
            $st->execute(array(
                $r['id'], isset($r['title']) ? $r['title'] : '', isset($r['content']) ? $r['content'] : '',
                $parentId !== '' ? $parentId : null,
                $cycle,
                $kind,
                $weekdays,
                isset($r['monthDay']) ? (int)$r['monthDay'] : 0,
                date_in(isset($r['startDate']) ? $r['startDate'] : '') ?: today_d(),
                date_in(isset($r['endDate']) ? $r['endDate'] : ''),
                isset($r['storeCodes']) ? $r['storeCodes'] : '',
                $sampleImages ? json_encode($sampleImages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                isset($r['status']) && $r['status'] === 'disabled' ? 'disabled' : 'enabled',
                isset($r['createdBy']) ? $r['createdBy'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        };
        foreach ($topRows as $r) $insertTpl($r, '');
        /* 子任务必须挂在已恢复的顶层母任务下，且只允许一层 */
        foreach ($childRows as $r) {
            $pid = (string)$r['parentId'];
            $parent = task_template_row($pid);
            $insertTpl($r, ($parent && (string)$parent['parent_id'] === '') ? $pid : '');
        }
        $instSql = 'INSERT IGNORE INTO task_instances (template_id, period_date, status, submitter_id, submitter_name, submitted_at, images_json, reviewed_by, reviewer_id, reviewed_at, reject_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['taskInstances']) ? $data['taskInstances'] : array()) as $r) {
            $sid = isset($r['submitterId']) ? $r['submitterId'] : '';
            if ($sid !== '' && !staff_by_id($sid)) $sid = null;
            $rid = isset($r['reviewerId']) ? $r['reviewerId'] : '';
            if ($rid !== '' && !staff_by_id($rid)) $rid = null;
            $status = isset($r['status']) ? $r['status'] : 'pending';
            if (!in_array($status, array('pending', 'submitted', 'approved', 'rejected'), true)) $status = 'pending';
            $st = $pdo->prepare($instSql);
            $st->execute(array(
                $r['templateId'], date_in(isset($r['periodDate']) ? $r['periodDate'] : ''),
                $status, $sid, isset($r['submitterName']) ? $r['submitterName'] : '',
                dt_in(isset($r['submittedAt']) ? $r['submittedAt'] : ''),
                json_encode(isset($r['images']) && is_array($r['images']) ? $r['images'] : array(), JSON_UNESCAPED_UNICODE),
                isset($r['reviewedBy']) ? $r['reviewedBy'] : '', $rid,
                dt_in(isset($r['reviewedAt']) ? $r['reviewedAt'] : ''),
                isset($r['rejectReason']) ? $r['rejectReason'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '')
            ));
        }

        $attSql = 'INSERT INTO attendance (staff_id, month, should_rest_days, actual_work_days, remark, updated_by, updated_at) VALUES (?,?,?,?,?,?,?)';
        foreach ((isset($data['attendance']) ? $data['attendance'] : array()) as $r) {
            $st = $pdo->prepare($attSql);
            $st->execute(array(
                $r['staffId'], $r['month'],
                isset($r['shouldRestDays']) ? (float)$r['shouldRestDays'] : 0,
                isset($r['actualWorkDays']) ? (float)$r['actualWorkDays'] : 0,
                isset($r['remark']) ? $r['remark'] : '',
                isset($r['updatedBy']) ? $r['updatedBy'] : '',
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }

        $adCols = array('id', 'staff_id', 'work_date', 'segment_no', 'emp_no', 'staff_name', 'store_code', 'store_name',
            'position', 'employment_type', 'schedule_type', 'planned_in', 'planned_out', 'planned_hours', 'meal_hours',
            'planned_work_hours', 'clock_in', 'clock_out', 'confirm_in', 'confirm_out', 'confirm_meal_hours',
            'actual_hours', 'hour_diff', 'manager_confirm', 'employee_confirm', 'imported_by', 'imported_at',
            'created_at', 'updated_at');
        $adSql = 'INSERT IGNORE INTO attendance_daily (' . implode(',', $adCols) . ') VALUES (' . implode(',', array_fill(0, count($adCols), '?')) . ')';
        foreach ((isset($data['attendanceDaily']) ? $data['attendanceDaily'] : array()) as $r) {
            if (!isset($r['staffId']) || !staff_by_id($r['staffId'])) continue;
            $adTime = function ($v) {
                $s = trim((string)$v);
                return $s === '' ? null : substr($s, 0, 8);
            };
            $st = $pdo->prepare($adSql);
            $st->execute(array(
                isset($r['id']) ? $r['id'] : ($r['staffId'] . '-' . $r['workDate'] . '-' . (isset($r['segmentNo']) ? (int)$r['segmentNo'] : 1)),
                $r['staffId'], date_in(isset($r['workDate']) ? $r['workDate'] : '') ?: today_d(),
                isset($r['segmentNo']) ? (int)$r['segmentNo'] : 1,
                isset($r['empNo']) ? (string)$r['empNo'] : '',
                isset($r['staffName']) ? (string)$r['staffName'] : '',
                isset($r['storeCode']) ? (string)$r['storeCode'] : '',
                isset($r['storeName']) ? (string)$r['storeName'] : '',
                isset($r['position']) ? (string)$r['position'] : '',
                isset($r['employmentType']) ? (string)$r['employmentType'] : '',
                isset($r['scheduleType']) ? (string)$r['scheduleType'] : '',
                $adTime(isset($r['plannedIn']) ? $r['plannedIn'] : ''),
                $adTime(isset($r['plannedOut']) ? $r['plannedOut'] : ''),
                isset($r['plannedHours']) ? (float)$r['plannedHours'] : 0,
                isset($r['mealHours']) ? (float)$r['mealHours'] : 0,
                isset($r['plannedWorkHours']) ? (float)$r['plannedWorkHours'] : 0,
                $adTime(isset($r['clockIn']) ? $r['clockIn'] : ''),
                $adTime(isset($r['clockOut']) ? $r['clockOut'] : ''),
                $adTime(isset($r['confirmIn']) ? $r['confirmIn'] : ''),
                $adTime(isset($r['confirmOut']) ? $r['confirmOut'] : ''),
                isset($r['confirmMealHours']) ? (float)$r['confirmMealHours'] : 0,
                isset($r['actualHours']) ? (float)$r['actualHours'] : 0,
                isset($r['hourDiff']) ? (float)$r['hourDiff'] : 0,
                isset($r['managerConfirm']) ? (string)$r['managerConfirm'] : '',
                isset($r['employeeConfirm']) ? (string)$r['employeeConfirm'] : '',
                isset($r['importedBy']) ? (string)$r['importedBy'] : '',
                dt_in(isset($r['importedAt']) ? $r['importedAt'] : ''),
                dt_in(isset($r['importedAt']) ? $r['importedAt'] : '') ?: now_dt(),
                dt_in(isset($r['importedAt']) ? $r['importedAt'] : '') ?: now_dt()
            ));
        }

        $stationSql = 'INSERT IGNORE INTO shift_stations (id, name, sort_order, enabled, builtin, created_at, updated_at) VALUES (?,?,?,?,?,?,?)';
        foreach ((isset($data['shiftStations']) ? $data['shiftStations'] : array()) as $r) {
            $pdo->prepare($stationSql)->execute(array(
                $r['id'], $r['name'], isset($r['sortOrder']) ? (int)$r['sortOrder'] : 0,
                !empty($r['enabled']) ? 1 : 0, !empty($r['builtin']) ? 1 : 0, now_dt(), now_dt()
            ));
        }

        $dsSql = 'INSERT IGNORE INTO daily_shifts (id, staff_id, work_date, segment_no, start_time, end_time, station_id, station_name, task, created_by, created_by_name, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['dailyShifts']) ? $data['dailyShifts'] : array()) as $r) {
            if (!isset($r['staffId']) || !staff_by_id($r['staffId'])) continue;
            $tm = function ($v) { $s = trim((string)$v); return $s === '' ? null : substr($s, 0, 8); };
            $segNo = isset($r['segmentNo']) ? (int)$r['segmentNo'] : 1;
            if ($segNo < 1 || $segNo > 2) $segNo = 1;
            $fallbackId = 'SH' . $r['staffId'] . $r['date'] . 'S' . $segNo;
            $pdo->prepare($dsSql)->execute(array(
                (isset($r['id']) && $r['id'] !== '') ? $r['id'] : $fallbackId,
                $r['staffId'], date_in(isset($r['date']) ? $r['date'] : '') ?: today_d(),
                $segNo,
                $tm(isset($r['startTime']) ? $r['startTime'] : ''),
                $tm(isset($r['endTime']) ? $r['endTime'] : ''),
                isset($r['stationId']) ? (string)$r['stationId'] : '',
                isset($r['stationName']) ? (string)$r['stationName'] : '',
                isset($r['task']) ? (string)$r['task'] : '',
                isset($r['createdBy']) ? (string)$r['createdBy'] : '',
                isset($r['createdByName']) ? (string)$r['createdByName'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }

        $corrSql = 'INSERT INTO corrections (id, staff_id, field, field_label, old_value, new_value, note, status, created_at, reviewed_by, reviewed_at, reject_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['corrections']) ? $data['corrections'] : array()) as $r) {
            $st = $pdo->prepare($corrSql);
            $st->execute(array(
                $r['id'], $r['staffId'], $r['field'], isset($r['fieldLabel']) ? $r['fieldLabel'] : '',
                isset($r['oldValue']) ? $r['oldValue'] : '', isset($r['newValue']) ? $r['newValue'] : '',
                isset($r['note']) ? $r['note'] : '', isset($r['status']) ? $r['status'] : 'pending',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                isset($r['reviewedBy']) ? $r['reviewedBy'] : '',
                dt_in(isset($r['reviewedAt']) ? $r['reviewedAt'] : ''),
                isset($r['rejectReason']) ? $r['rejectReason'] : ''
            ));
        }

        $hcvRows = isset($data['healthVerifications']) ? $data['healthVerifications'] : (isset($data['healthCertVerifications']) ? $data['healthCertVerifications'] : array());
        $hcvSql = 'INSERT IGNORE INTO health_cert_verifications (id, staff_id, cert_key, result, remark, material_key, material_name, verified_by, verified_name, verified_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)';
        foreach ($hcvRows as $r) {
            $st = $pdo->prepare($hcvSql);
            $st->execute(array(
                isset($r['id']) ? $r['id'] : ('HV' . substr(md5(uniqid('', true)), 0, 14)),
                $r['staffId'], isset($r['certKey']) ? $r['certKey'] : '',
                isset($r['result']) ? $r['result'] : 'pass',
                isset($r['remark']) ? $r['remark'] : '',
                isset($r['materialKey']) ? $r['materialKey'] : '',
                isset($r['materialName']) ? $r['materialName'] : '',
                isset($r['verifiedBy']) ? $r['verifiedBy'] : '',
                isset($r['verifiedByName']) ? $r['verifiedByName'] : '',
                dt_in(isset($r['verifiedAt']) ? $r['verifiedAt'] : '') ?: now_dt(),
                dt_in(isset($r['verifiedAt']) ? $r['verifiedAt'] : '') ?: now_dt()
            ));
        }

        $fbSql = 'INSERT IGNORE INTO feedbacks (id, staff_id, content, last_at, created_at, updated_at) VALUES (?,?,?,?,?,?)';
        foreach ((isset($data['feedbacks']) ? $data['feedbacks'] : array()) as $r) {
            $sid = isset($r['staffId']) ? (string)$r['staffId'] : '';
            if ($sid !== '' && !staff_by_id($sid)) continue;
            $st = $pdo->prepare($fbSql);
            $st->execute(array(
                $r['id'], $sid, isset($r['content']) ? $r['content'] : '',
                dt_in(isset($r['lastAt']) ? $r['lastAt'] : '') ?: now_dt(),
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }
        $frSql = 'INSERT IGNORE INTO feedback_replies (id, feedback_id, author_role, author_staff_id, content, created_at) VALUES (?,?,?,?,?,?)';
        foreach ((isset($data['feedbackReplies']) ? $data['feedbackReplies'] : array()) as $r) {
            if (!feedback_row(isset($r['feedbackId']) ? $r['feedbackId'] : '')) continue;
            $st = $pdo->prepare($frSql);
            $st->execute(array(
                isset($r['id']) ? $r['id'] : next_feedback_reply_id(),
                $r['feedbackId'],
                isset($r['authorRole']) && $r['authorRole'] === 'super' ? 'super' : 'staff',
                isset($r['authorStaffId']) ? (string)$r['authorStaffId'] : '',
                isset($r['content']) ? $r['content'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt()
            ));
        }

        $bgSql = 'INSERT IGNORE INTO birthday_greetings (staff_id, year, created_at) VALUES (?,?,?)';
        foreach ((isset($data['birthdayGreetings']) ? $data['birthdayGreetings'] : array()) as $r) {
            $sid = isset($r['staffId']) ? (string)$r['staffId'] : '';
            if ($sid === '' || !staff_by_id($sid)) continue;
            $st = $pdo->prepare($bgSql);
            $st->execute(array($sid, (int)(isset($r['year']) ? $r['year'] : date('Y')), dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt()));
        }

        $ecSql = 'INSERT IGNORE INTO expiry_categories (id, name, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)';
        $catIds = array();
        foreach ((isset($data['expiryCategories']) ? $data['expiryCategories'] : array()) as $r) {
            $catIds[$r['id']] = true;
            $st = $pdo->prepare($ecSql);
            $st->execute(array(
                $r['id'], isset($r['name']) ? $r['name'] : '',
                isset($r['sortOrder']) ? (int)$r['sortOrder'] : 0,
                !empty($r['enabled']) ? 1 : 0,
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }
        $emSql = 'INSERT IGNORE INTO expiry_materials (id, category_id, name, default_mode, default_hours, default_time, close_due, sort_order, enabled, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['expiryMaterials']) ? $data['expiryMaterials'] : array()) as $r) {
            $cid = isset($r['categoryId']) ? (string)$r['categoryId'] : '';
            if (!isset($catIds[$cid])) continue;
            $st = $pdo->prepare($emSql);
            $st->execute(array(
                $r['id'], $cid, isset($r['name']) ? $r['name'] : '',
                isset($r['defaultMode']) && $r['defaultMode'] === 'hours' ? 'hours' : 'time',
                isset($r['defaultHours']) ? (float)$r['defaultHours'] : 0,
                isset($r['defaultTime']) ? substr((string)$r['defaultTime'], 0, 8) : '',
                !empty($r['closeDue']) ? 1 : 0,
                isset($r['sortOrder']) ? (int)$r['sortOrder'] : 0,
                !empty($r['enabled']) ? 1 : 0,
                isset($r['remark']) ? (string)$r['remark'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }
        $erSql = 'INSERT IGNORE INTO expiry_records (id, material_id, category_id, material_name, category_name, check_date, due_at, note, status, processed_by, processed_at, created_by, created_at, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        foreach ((isset($data['expiryRecords']) ? $data['expiryRecords'] : array()) as $r) {
            $st = $pdo->prepare($erSql);
            $st->execute(array(
                $r['id'], $r['materialId'],
                isset($r['categoryId']) ? (string)$r['categoryId'] : '',
                isset($r['materialName']) ? (string)$r['materialName'] : '',
                isset($r['categoryName']) ? (string)$r['categoryName'] : '',
                date_in(isset($r['checkDate']) ? $r['checkDate'] : '') ?: today_d(),
                dt_in(isset($r['dueAt']) ? $r['dueAt'] : '') ?: now_dt(),
                isset($r['note']) ? (string)$r['note'] : '',
                isset($r['status']) && $r['status'] === 'processed' ? 'processed' : 'normal',
                isset($r['processedBy']) ? (string)$r['processedBy'] : '',
                dt_in(isset($r['processedAt']) ? $r['processedAt'] : ''),
                isset($r['createdBy']) ? (string)$r['createdBy'] : '',
                dt_in(isset($r['createdAt']) ? $r['createdAt'] : '') ?: now_dt(),
                isset($r['updatedBy']) ? (string)$r['updatedBy'] : '',
                dt_in(isset($r['updatedAt']) ? $r['updatedAt'] : '') ?: now_dt()
            ));
        }

        if (isset($data['settings']) && is_array($data['settings'])) {
            $settings = array_merge(settings_data(), $data['settings']);
            save_settings_data($settings);
        }

        $logSql = 'INSERT INTO audit_logs (time, operator, role, target, action, detail) VALUES (?,?,?,?,?,?)';
        foreach ((isset($data['auditLogs']) ? $data['auditLogs'] : array()) as $l) {
            $st = $pdo->prepare($logSql);
            $st->execute(array(
                dt_in(isset($l['time']) ? $l['time'] : '') ?: now_dt(),
                isset($l['operator']) ? $l['operator'] : '访客',
                isset($l['role']) ? $l['role'] : 'guest',
                isset($l['target']) ? $l['target'] : '—',
                isset($l['action']) ? $l['action'] : '',
                isset($l['detail']) ? $l['detail'] : ''
            ));
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        if ($e instanceof ApiException) throw $e;
        throw new ApiException('恢复失败：' . $e->getMessage(), 'RESTORE_FAIL', 500);
    }
    expiry_seed_defaults();

    return array('ok' => true, 'count' => count($data['staff']));
}

function api_data_clear($in)
{
    $acc = require_super();
    $pdo = db();
    $pdo->beginTransaction();
    try {
        foreach (array('expiry_records', 'expiry_materials', 'expiry_categories', 'feedback_replies', 'feedbacks', 'birthday_greetings', 'health_cert_verifications', 'reimburse_claims', 'staff_payees', 'task_instances', 'task_templates', 'salaries', 'scores', 'leaves', 'shift_requests', 'notice_reads', 'notices', 'schedule_participants', 'schedules', 'daily_shifts', 'attendance_daily', 'attendance', 'corrections', 'audit_logs', 'messages', 'webhook_push_logs') as $t) {
            $pdo->exec('DELETE FROM ' . $t);
        }
        $st = $pdo->prepare('DELETE FROM accounts WHERE id <> ?');
        $st->execute(array($acc['id']));
        $st = $pdo->prepare('DELETE FROM staff WHERE id <> ?');
        $st->execute(array($acc['staff_id']));
        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }
    audit_log('清空演示数据', '全量数据', '保留当前登录的超级管理员账号');
    return array('ok' => true);
}

function api_data_reset($in)
{
    require_super();
    demo_reset();
    audit_log('重置演示数据', '全量数据', '恢复为初始演示数据');
    return array('ok' => true);
}
