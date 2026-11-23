<?php
/* webhook_actions.php — 飞书多维表格自动化 webhook：任务即将到期推送、失败重试与推送记录 */

/* ---------------- 配置 ---------------- */

function feishu_webhook_defaults()
{
    return array(
        'enabled' => false,
        'url' => '',
        'advanceValue' => 30,
        'advanceUnit' => 'minute',
        'maxRetries' => 3,
        'events' => array('taskDueSoon' => true, 'noticePublished' => true, 'reminderOverdue' => true, 'expiryDue' => true, 'expiryDaily' => true),
        /* 空字符串表示使用默认文案，不改变既有行为 */
        'templates' => array('taskDueSoon' => '', 'noticePublished' => '', 'reminderOverdue' => '', 'expiryDue' => '', 'expiryDaily' => '')
    );
}

/* 模板清洗：允许换行，首尾空白裁掉，超长截断；空模板 = 使用默认文案 */
function feishu_template_clean($s)
{
    $s = trim((string)$s);
    return mb_strlen($s, 'UTF-8') > 1000 ? mb_substr($s, 0, 1000, 'UTF-8') : $s;
}

/* 占位符替换：未知占位符保留原样，便于发现拼写错误；数组/null 安全处理 */
function feishu_render_template($template, $payload)
{
    $t = trim((string)$template);
    if ($t === '') return '';
    return preg_replace_callback('/\{([A-Za-z0-9_]+)\}/', function ($m) use ($payload) {
        $k = $m[1];
        if (!array_key_exists($k, $payload)) return $m[0];
        $v = $payload[$k];
        if (is_array($v)) return $m[0];
        if (is_bool($v)) return $v ? '是' : '否';
        if ($v === null) return '';
        return (string)$v;
    }, $t);
}

function feishu_apply_template($template, $payload, $default)
{
    $text = feishu_render_template($template, $payload);
    return $text === '' ? $default : $text;
}

function feishu_webhook_normalize($raw)
{
    $cfg = array_merge(feishu_webhook_defaults(), is_array($raw) ? $raw : array());
    $cfg['enabled'] = !empty($cfg['enabled']);
    $cfg['url'] = trim((string)$cfg['url']);
    $cfg['advanceUnit'] = $cfg['advanceUnit'] === 'hour' ? 'hour' : 'minute';
    $cfg['advanceValue'] = (int)$cfg['advanceValue'];
    if ($cfg['advanceUnit'] === 'hour') {
        $cfg['advanceValue'] = max(1, min(168, $cfg['advanceValue']));
    } else {
        $cfg['advanceValue'] = max(1, min(10080, $cfg['advanceValue']));
    }
    $cfg['maxRetries'] = max(1, min(5, (int)$cfg['maxRetries']));
    $events = isset($cfg['events']) && is_array($cfg['events']) ? $cfg['events'] : array();
    $cfg['events'] = array(
        'taskDueSoon' => !empty($events['taskDueSoon']),
        /* 旧配置没有该键时默认开启，升级后无需重新保存即可使用 */
        'noticePublished' => array_key_exists('noticePublished', $events) ? !empty($events['noticePublished']) : true,
        'reminderOverdue' => array_key_exists('reminderOverdue', $events) ? !empty($events['reminderOverdue']) : true,
        'expiryDue' => array_key_exists('expiryDue', $events) ? !empty($events['expiryDue']) : true,
        'expiryDaily' => array_key_exists('expiryDaily', $events) ? !empty($events['expiryDaily']) : true
    );
    $tpl = isset($cfg['templates']) && is_array($cfg['templates']) ? $cfg['templates'] : array();
    $cfg['templates'] = array(
        'taskDueSoon' => feishu_template_clean(isset($tpl['taskDueSoon']) ? $tpl['taskDueSoon'] : ''),
        'noticePublished' => feishu_template_clean(isset($tpl['noticePublished']) ? $tpl['noticePublished'] : ''),
        'reminderOverdue' => feishu_template_clean(isset($tpl['reminderOverdue']) ? $tpl['reminderOverdue'] : ''),
        'expiryDue' => feishu_template_clean(isset($tpl['expiryDue']) ? $tpl['expiryDue'] : ''),
        'expiryDaily' => feishu_template_clean(isset($tpl['expiryDaily']) ? $tpl['expiryDaily'] : '')
    );
    return $cfg;
}

function feishu_webhook_config()
{
    $s = settings_data();
    $raw = isset($s['feishuWebhook']) ? $s['feishuWebhook'] : array();
    return feishu_webhook_normalize($raw);
}

function feishu_webhook_advance_minutes($cfg)
{
    return (int)$cfg['advanceValue'] * ($cfg['advanceUnit'] === 'hour' ? 60 : 1);
}

/* 保存时校验：仅允许公网 http/https，避免被当作内网探测入口 */
function feishu_url_allowed($url)
{
    $url = trim((string)$url);
    if ($url === '' || strlen($url) > 500) return false;
    $u = parse_url($url);
    if (!$u || empty($u['host'])) return false;
    $scheme = strtolower(isset($u['scheme']) ? $u['scheme'] : '');
    if (!in_array($scheme, array('http', 'https'), true)) return false;
    $host = strtolower(trim((string)$u['host'], '[]'));
    if ($host === '' || $host === 'localhost' || $host === '::1') return false;
    if (preg_match('/^127\./', $host) || preg_match('/^10\./', $host) ||
        preg_match('/^192\.168\./', $host) || preg_match('/^169\.254\./', $host) ||
        preg_match('/^172\.(1[6-9]|2\d|3[01])\./', $host)) {
        return false;
    }
    if (strpos($host, ':') !== false) return false; /* IPv6 字面量 */
    return true;
}

function feishu_webhook_from_input($input, $current)
{
    $cfg = feishu_webhook_normalize($current);
    if (isset($input['enabled'])) $cfg['enabled'] = !empty($input['enabled']);
    if (isset($input['url'])) $cfg['url'] = trim(str_limit((string)$input['url'], 500));
    if (isset($input['advanceValue'])) $cfg['advanceValue'] = (int)$input['advanceValue'];
    if (isset($input['advanceUnit'])) $cfg['advanceUnit'] = (string)$input['advanceUnit'];
    if (isset($input['maxRetries'])) $cfg['maxRetries'] = (int)$input['maxRetries'];
    if (isset($input['events']) && is_array($input['events'])) {
        $cfg['events'] = array(
            'taskDueSoon' => !empty($input['events']['taskDueSoon']),
            'noticePublished' => !empty($input['events']['noticePublished']),
            'reminderOverdue' => !empty($input['events']['reminderOverdue']),
            'expiryDue' => !empty($input['events']['expiryDue']),
            'expiryDaily' => !empty($input['events']['expiryDaily'])
        );
    }
    if (isset($input['templates']) && is_array($input['templates'])) {
        $map = array('taskDueSoon' => '任务即将到期', 'noticePublished' => '通知发布', 'reminderOverdue' => '提醒逾期', 'expiryDue' => '效期临期', 'expiryDaily' => '效期日报');
        foreach ($map as $k => $label) {
            $v = isset($input['templates'][$k]) ? (string)$input['templates'][$k] : '';
            if (mb_strlen(trim($v), 'UTF-8') > 1000) throw new ApiException('「' . $label . '」模板不能超过 1000 字');
            $cfg['templates'][$k] = $v;
        }
    }
    $cfg = feishu_webhook_normalize($cfg);
    if ($cfg['url'] !== '' && !feishu_url_allowed($cfg['url'])) {
        throw new ApiException('webhook 地址不合法：仅支持公网 http/https 地址');
    }
    if ($cfg['enabled'] && $cfg['url'] === '') {
        throw new ApiException('启用推送前请填写 webhook 地址');
    }
    if (!$cfg['events']['taskDueSoon'] && !$cfg['events']['noticePublished'] && !$cfg['events']['reminderOverdue'] && !$cfg['events']['expiryDue'] && !$cfg['events']['expiryDaily']) {
        throw new ApiException('请至少选择一个事件类型');
    }
    return $cfg;
}

/* ---------------- 个人提醒通道配置 ---------------- */

function personal_webhook_defaults()
{
    return array(
        'enabled' => false,
        'url' => '',
        'maxRetries' => 3,
        'events' => array('system' => true, 'task' => true, 'private' => true, 'schedule' => true, 'birthday' => true),
        'templates' => array('system' => '', 'task' => '', 'private' => '', 'test' => '', 'schedule' => '', 'birthday' => '')
    );
}

function personal_webhook_normalize($raw)
{
    $cfg = array_merge(personal_webhook_defaults(), is_array($raw) ? $raw : array());
    $cfg['enabled'] = !empty($cfg['enabled']);
    $cfg['url'] = trim((string)$cfg['url']);
    $cfg['maxRetries'] = max(1, min(5, (int)$cfg['maxRetries']));
    $e = isset($cfg['events']) && is_array($cfg['events']) ? $cfg['events'] : array();
    $cfg['events'] = array(
        'system' => array_key_exists('system', $e) ? !empty($e['system']) : true,
        'task' => array_key_exists('task', $e) ? !empty($e['task']) : true,
        'private' => array_key_exists('private', $e) ? !empty($e['private']) : true,
        'schedule' => array_key_exists('schedule', $e) ? !empty($e['schedule']) : true,
        'birthday' => array_key_exists('birthday', $e) ? !empty($e['birthday']) : true,
        'shift' => array_key_exists('shift', $e) ? !empty($e['shift']) : true
    );
    $tpl = isset($cfg['templates']) && is_array($cfg['templates']) ? $cfg['templates'] : array();
    $cfg['templates'] = array(
        'system' => feishu_template_clean(isset($tpl['system']) ? $tpl['system'] : ''),
        'task' => feishu_template_clean(isset($tpl['task']) ? $tpl['task'] : ''),
        'private' => feishu_template_clean(isset($tpl['private']) ? $tpl['private'] : ''),
        'test' => feishu_template_clean(isset($tpl['test']) ? $tpl['test'] : ''),
        'schedule' => feishu_template_clean(isset($tpl['schedule']) ? $tpl['schedule'] : ''),
        'birthday' => feishu_template_clean(isset($tpl['birthday']) ? $tpl['birthday'] : ''),
        'shift' => feishu_template_clean(isset($tpl['shift']) ? $tpl['shift'] : '')
    );
    return $cfg;
}

function personal_webhook_config()
{
    $s = settings_data();
    return personal_webhook_normalize(isset($s['personalWebhook']) ? $s['personalWebhook'] : array());
}

function personal_webhook_from_input($input, $current)
{
    $cfg = personal_webhook_normalize($current);
    if (isset($input['enabled'])) $cfg['enabled'] = !empty($input['enabled']);
    if (isset($input['url'])) $cfg['url'] = trim(str_limit((string)$input['url'], 500));
    if (isset($input['maxRetries'])) $cfg['maxRetries'] = (int)$input['maxRetries'];
    if (isset($input['events']) && is_array($input['events'])) {
        $cfg['events'] = array(
            'system' => !empty($input['events']['system']),
            'task' => !empty($input['events']['task']),
            'private' => !empty($input['events']['private']),
            'schedule' => !empty($input['events']['schedule']),
            'birthday' => !empty($input['events']['birthday']),
            'shift' => !empty($input['events']['shift'])
        );
    }
    if (isset($input['templates']) && is_array($input['templates'])) {
        $map = array('system' => '系统通知/审批结果', 'task' => '任务指派与审核', 'private' => '私信', 'test' => '测试', 'schedule' => '日程提醒', 'birthday' => '生日关怀', 'shift' => '今日排班');
        foreach ($map as $k => $label) {
            $v = isset($input['templates'][$k]) ? (string)$input['templates'][$k] : '';
            if (mb_strlen(trim($v), 'UTF-8') > 1000) throw new ApiException('「' . $label . '」模板不能超过 1000 字');
            $cfg['templates'][$k] = $v;
        }
    }
    $cfg = personal_webhook_normalize($cfg);
    if ($cfg['url'] !== '' && !feishu_url_allowed($cfg['url'])) {
        throw new ApiException('个人提醒 webhook 地址不合法：仅支持公网 http/https 地址');
    }
    if ($cfg['enabled'] && $cfg['url'] === '') {
        throw new ApiException('启用个人提醒前请填写 webhook 地址');
    }
    if (!$cfg['events']['system'] && !$cfg['events']['task'] && !$cfg['events']['private'] && !$cfg['events']['schedule'] && !$cfg['events']['birthday'] && !$cfg['events']['shift']) {
        throw new ApiException('请至少选择一个个人提醒事件');
    }
    return $cfg;
}

/* ---------------- 推送内容 ---------------- */

function feishu_webhook_event_label($event)
{
    $map = array(
        'task.due_soon' => '任务即将到期',
        'reminder.overdue' => '提醒已逾期',
        'notices.published' => '通知发布',
        'expiry.due_soon' => '效期临期',
        'expiry.daily' => '效期日报',
        'personal.system' => '个人提醒 · 系统/审批',
        'personal.task' => '个人提醒 · 任务',
        'personal.private' => '个人提醒 · 私信',
        'personal.schedule' => '个人提醒 · 日程',
        'personal.birthday' => '个人提醒 · 生日关怀',
        'personal.shift' => '个人提醒 · 今日排班',
        'personal.test' => '个人提醒 · 测试',
        'test' => '测试推送'
    );
    return isset($map[$event]) ? $map[$event] : $event;
}

/* 通知正文摘要：压缩空白，最多 100 字 */
function notice_webhook_summary($body, $max = 100)
{
    $text = trim(preg_replace('/\s+/u', ' ', (string)$body));
    $len = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    if ($len <= $max) return $text;
    return (function_exists('mb_substr') ? mb_substr($text, 0, $max, 'UTF-8') : substr($text, 0, $max)) . '…';
}

function feishu_reminder_text($p)
{
    $lines = array();
    $lines[] = '【提醒已逾期】' . $p['storeName'];
    $lines[] = '提醒：' . $p['taskTitle'];
    if (!empty($p['groupTitle']) && $p['groupTitle'] !== $p['taskTitle']) $lines[] = '所属母提醒：' . $p['groupTitle'];
    $lines[] = '执行日期：' . $p['periodDate'];
    $lines[] = '截止时间：' . $p['deadlineAt'];
    if (!empty($p['assignee'])) $lines[] = '执行人：' . $p['assignee'];
    $lines[] = '状态：已逾期，请尽快处理';
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_webhook_text($p)
{
    $lines = array();
    $lines[] = '【' . $p['eventLabel'] . '】' . $p['storeName'];
    $lines[] = '任务：' . $p['taskTitle'];
    if (!empty($p['groupTitle']) && $p['groupTitle'] !== $p['taskTitle']) $lines[] = '所属母任务：' . $p['groupTitle'];
    $lines[] = '执行日期：' . $p['periodDate'];
    $lines[] = '截止时间：' . $p['deadlineAt'];
    if (!empty($p['assignee'])) $lines[] = '指派人：' . $p['assignee'];
    $lines[] = '待完成数量：' . $p['pendingCount'];
    if (!empty($p['progressText'])) $lines[] = '整组进度：' . $p['progressText'];
    $lines[] = '距截止：约 ' . $p['remainMinutes'] . ' 分钟';
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_notice_text($p)
{
    $lines = array();
    $lines[] = '【通知发布】' . $p['category'] . ' · ' . $p['noticeTitle'];
    if ($p['summary'] !== '') $lines[] = $p['summary'];
    $lines[] = '发布人：' . ($p['publisher'] !== '' ? $p['publisher'] : '门店管理组');
    $lines[] = '发布时间：' . $p['publishedAt'];
    $lines[] = '发布方式：' . $p['scheduledText'];
    if (!empty($p['noticeLink'])) $lines[] = '公告链接：' . $p['noticeLink'];
    if ($p['flags'] !== '') $lines[] = '标记：' . $p['flags'];
    $lines[] = '门店：' . $p['storeName'];
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_personal_text($p)
{
    $lines = array();
    $lines[] = '【个人提醒】' . $p['recipientName'] . ' · ' . $p['title'];
    if ($p['summary'] !== '') $lines[] = $p['summary'];
    $lines[] = '消息类型：' . $p['messageTypeLabel'];
    $lines[] = '发送人：' . $p['sender'];
    $lines[] = '时间：' . $p['sentAt'];
    $lines[] = '门店：' . $p['storeName'];
    if ($p['link'] !== '') $lines[] = '跳转：' . $p['link'];
    $lines[] = '接收人：' . $p['recipientName'] . ' / ' . $p['recipientPhone']
        . ($p['recipientFeishuStaffNo'] !== '' ? ' / 飞书工号 ' . $p['recipientFeishuStaffNo'] : '')
        . ($p['recipientFeishuId'] !== '' ? ' / ' . $p['recipientFeishuId'] : '');
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_expiry_text($p)
{
    $lines = array();
    $lines[] = '【效期临期】' . $p['categoryName'] . ' · ' . $p['materialName'];
    $lines[] = '到期时间：' . $p['dueText'] . '（剩余 ' . $p['remainMinutes'] . ' 分钟）';
    $lines[] = '检查日期：' . $p['checkDate'];
    if (!empty($p['registeredBy'])) $lines[] = '登记人：' . $p['registeredBy'];
    if (!empty($p['note'])) $lines[] = '备注：' . $p['note'];
    $lines[] = '处理方式：到期前请在「效期」页标记已处理';
    $lines[] = '门店：' . $p['storeName'];
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_expiry_daily_text($p)
{
    $lines = array();
    $lines[] = '【效期日报】' . $p['date'] . ' ' . $p['slot'] . ' · 今日到期 ' . $p['count'] . ' 项';
    $lines[] = $p['listText'];
    $lines[] = '门店：' . $p['storeName'] . '（' . $p['storeCode'] . '）';
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

function feishu_expiry_status_label($status)
{
    if ($status === 'scrapped') return '已报废';
    if ($status === 'processed') return '已处理';
    return '未处理';
}

/* 日报清单限 30 行、1800 字，超出只提示总数，避免飞书消息过长 */
function feishu_expiry_daily_list_text($rows)
{
    $lines = array();
    $chars = 0;
    $shown = 0;
    $total = count($rows);
    foreach ($rows as $r) {
        if ($shown >= 30) break;
        $category = isset($r['category_name']) && (string)$r['category_name'] !== '' ? (string)$r['category_name'] : '未分类';
        $material = isset($r['material_name']) && (string)$r['material_name'] !== '' ? (string)$r['material_name'] : '未命名';
        $createdBy = isset($r['created_by']) && (string)$r['created_by'] !== '' ? (string)$r['created_by'] : '—';
        $checkDate = isset($r['check_date']) && (string)$r['check_date'] !== '' ? (string)$r['check_date'] : '—';
        $line = ($shown + 1) . '. ' . $category . ' / ' . $material
            . ' · ' . substr((string)$r['due_at'], 11, 5)
            . ' · 登记 ' . $createdBy . '（' . $checkDate . '）'
            . ' · ' . feishu_expiry_status_label((string)$r['status']);
        $len = mb_strlen($line, 'UTF-8');
        if ($chars + $len > 1800) break;
        $lines[] = $line;
        $chars += $len + 1;
        $shown++;
    }
    if ($shown < $total) $lines[] = '…另有 ' . ($total - $shown) . ' 项，请前往效期总览查看';
    return implode("\n", $lines);
}

function feishu_schedule_text($p)
{    $lines = array();
    $lines[] = '【日程提醒】' . $p['scheduleTitle'];
    $lines[] = '时间：' . $p['scheduleDate'] . ' ' . $p['scheduleStartTime'] . ($p['scheduleEndTime'] !== '' ? ' - ' . $p['scheduleEndTime'] : '');
    if ($p['scheduleLocation'] !== '') $lines[] = '地点：' . $p['scheduleLocation'];
    if ($p['scheduleRemark'] !== '') $lines[] = '备注：' . $p['scheduleRemark'];
    $lines[] = '创建人：' . $p['sender'];
    $lines[] = '提醒：' . $p['remindText'];
    $lines[] = '门店：' . $p['storeName'];
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

/* 日程提醒：访问时惰性扫描，创建者与全部关联人各推一次；按「日程 + 提醒档 + 接收人」去重 */
function feishu_personal_schedule_tick()
{
    $cfg = personal_webhook_config();
    if (!$cfg['enabled'] || empty($cfg['events']['schedule'])) return 0;
    if ($cfg['url'] === '' || !feishu_url_allowed($cfg['url'])) return 0;
    $now = now_dt();
    $nowTs = strtotime($now);
    $info = store_info();
    $inserted = 0;
    $staffMap = array();
    foreach (db()->query('SELECT * FROM staff')->fetchAll() as $s) $staffMap[$s['id']] = $s;
    $pmap = array();
    foreach (db()->query('SELECT schedule_id, staff_id FROM schedule_participants')->fetchAll() as $pr) {
        $pmap[(string)$pr['schedule_id']][] = (string)$pr['staff_id'];
    }
    try {
        $st = db()->prepare("SELECT * FROM schedules
                             WHERE status = 'active' AND remind_minutes <> 0
                               AND schedule_date BETWEEN ? AND ? LIMIT 100");
        $st->execute(array(date('Y-m-d', $nowTs - 86400), date('Y-m-d', $nowTs + 86400)));
        $rows = $st->fetchAll();
    } catch (Exception $e) {
        return 0;
    }
    foreach ($rows as $r) {
        $startTs = strtotime($r['schedule_date'] . ' ' . $r['start_time']);
        if ($startTs === false) continue;
        $remind = (int)$r['remind_minutes'];
        $remindAt = $startTs - max(0, $remind) * 60;
        /* 到点后 1 小时内仍可补发；再晚不打扰 */
        if ($nowTs < $remindAt || $nowTs > $startTs + 3600) continue;
        $ownerId = (string)$r['staff_id'];
        $owner = isset($staffMap[$ownerId]) ? $staffMap[$ownerId] : array();
        $senderDisplay = display_name(isset($owner['name']) ? $owner['name'] : '', isset($owner['nickname']) ? $owner['nickname'] : '');
        $remindText = $remind === -1 ? '到点提醒' : ('提前 ' . $remind . ' 分钟');
        $startText = substr((string)$r['start_time'], 0, 5);
        $endText = $r['end_time'] ? substr((string)$r['end_time'], 0, 5) : '';
        $recipients = array($ownerId);
        if (isset($pmap[(string)$r['id']])) {
            foreach ($pmap[(string)$r['id']] as $pid) $recipients[] = $pid;
        }
        $recipients = array_values(array_unique($recipients));
        foreach ($recipients as $rid) {
            $rcp = isset($staffMap[$rid]) ? $staffMap[$rid] : null;
            if (!$rcp || $rcp['status'] !== 'active') continue;
            $display = display_name((string)$rcp['name'], isset($rcp['nickname']) ? (string)$rcp['nickname'] : '');
            $payload = array(
                'event' => 'personal.schedule', 'eventLabel' => '个人提醒 · 日程', 'channel' => 'personal',
                'title' => '日程提醒：' . $r['title'],
                'messageType' => 'schedule', 'messageTypeLabel' => '日程提醒',
                'summary' => (string)$r['remark'],
                'sender' => $senderDisplay !== '' ? $senderDisplay : $display, 'sentAt' => $now,
                'storeName' => $info['shortName'], 'storeCode' => $info['code'],
                'link' => 'schedule.html', 'page' => 'schedule',
                'refId' => (string)$r['id'], 'messageId' => (string)$r['id'],
                'recipientId' => $rid, 'recipientName' => $display,
                'recipientRealName' => (string)$rcp['name'], 'recipientNickname' => (string)$rcp['nickname'],
                'recipientPhone' => (string)$rcp['phone'],
                'recipientFeishuId' => (string)$rcp['feishu_id'],
                'recipientFeishuStaffNo' => (string)$rcp['feishu_emp_no'],
                'scheduleId' => (string)$r['id'], 'scheduleTitle' => (string)$r['title'],
                'scheduleDate' => (string)$r['schedule_date'], 'scheduleStartTime' => $startText,
                'scheduleEndTime' => $endText, 'scheduleLocation' => (string)$r['location'],
                'scheduleRemark' => (string)$r['remark'], 'remindText' => $remindText,
                'creatorName' => $senderDisplay
            );
            $payload['text'] = feishu_apply_template(isset($cfg['templates']['schedule']) ? $cfg['templates']['schedule'] : '', $payload, feishu_schedule_text($payload));
            $key = 'personal.schedule|' . $r['id'] . '|' . $remind . '|' . $rid;
            if (feishu_webhook_insert('personal.schedule', $key, $payload, 'schedule', (string)$r['id'], $cfg['maxRetries'], $now, 'personal', $rid)) {
                $inserted++;
            }
        }
    }
    if ($inserted) feishu_webhook_flush($cfg, 3, 'personal');
    return $inserted;
}

function feishu_public_test_text($p)
{
    return '【测试推送】' . $p['storeName'] . "\n这是系统设置页发送的测试消息，收到即表示地址可达。\n发送时间：" . $p['sentAt'] . "\n（由门店人员管理系统推送）";
}

function feishu_personal_test_text($p)
{
    $lines = array();
    $lines[] = '【个人提醒 · 测试】' . $p['recipientName'] . ' · ' . $p['title'];
    $lines[] = $p['summary'];
    $lines[] = '接收人：' . $p['recipientName'] . ' / ' . $p['recipientPhone']
        . ($p['recipientFeishuStaffNo'] !== '' ? ' / 飞书工号 ' . $p['recipientFeishuStaffNo'] : '')
        . ($p['recipientFeishuId'] !== '' ? ' / ' . $p['recipientFeishuId'] : '');
    $lines[] = '时间：' . $p['sentAt'];
    $lines[] = '门店：' . $p['storeName'];
    $lines[] = '（由门店人员管理系统推送）';
    return implode("\n", $lines);
}

/* 模板预览用示例数据（不落库、不发请求） */
function feishu_webhook_sample_payload($event)
{
    $info = store_info();
    $now = now_dt();
    $today = date('Y-m-d');
    $staff = array();
    try {
        $st = db()->query("SELECT * FROM staff WHERE status = 'active' ORDER BY id LIMIT 1");
        $staff = $st ? $st->fetch() : array();
    } catch (Exception $e) {
        $staff = array();
    }
    if (!$staff) $staff = array('id' => 'S001', 'name' => '张明', 'nickname' => '', 'phone' => '13900000001', 'feishu_id' => '', 'feishu_emp_no' => '');
    $name = (string)$staff['name'];
    $nickname = isset($staff['nickname']) ? (string)$staff['nickname'] : '';
    $display = display_name($name, $nickname);
    $phone = isset($staff['phone']) ? (string)$staff['phone'] : '';
    $feishuId = isset($staff['feishu_id']) ? (string)$staff['feishu_id'] : '';
    $feishuNo = isset($staff['feishu_emp_no']) ? (string)$staff['feishu_emp_no'] : '';

    if ($event === 'taskDueSoon') {
        return array(
            'event' => 'task.due_soon', 'eventLabel' => '任务即将到期',
            'title' => '门店任务即将到期',
            'taskTitle' => '晚班闭店检查', 'groupTitle' => '门店日常巡检',
            'periodDate' => $today, 'deadlineAt' => $today . ' 22:00:00', 'deadlineText' => $today . ' 22:00',
            'assignee' => $display,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'pendingCount' => 2, 'approvedCount' => 3, 'totalCount' => 5, 'progressText' => '3/5',
            'advanceMinutes' => 30, 'remainMinutes' => 30,
            'page' => 'tasks', 'link' => 'tasks.html', 'sentAt' => $now
        );
    }
    if ($event === 'reminderOverdue') {
        return array(
            'event' => 'reminder.overdue', 'eventLabel' => '提醒已逾期',
            'title' => '门店提醒已逾期',
            'taskTitle' => '每日闭店安全检查', 'groupTitle' => '',
            'reminderId' => 'T002', 'periodDate' => $today,
            'deadlineAt' => $today . ' 22:00:00', 'deadlineText' => $today . ' 22:00',
            'assignee' => $display,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'tasks', 'link' => 'tasks.html?tab=reminder', 'sentAt' => $now
        );
    }
    if ($event === 'noticePublished') {
        return array(
            'event' => 'notices.published', 'eventLabel' => '通知发布',
            'title' => '门店通知发布', 'noticeId' => 'N001',
            'category' => '门店通知', 'noticeTitle' => '关于秋季排班的通知',
            'summary' => '本周起门店晚间排班调整为两班制，请各位伙伴留意到岗时间。',
            'publisher' => $display, 'publishedAt' => $now,
            'important' => true, 'pinned' => false, 'scheduled' => false,
            'scheduledText' => '立即发布', 'flags' => '重要',
            'noticeLink' => 'https://example.com/notice.html?id=N001',
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'notices', 'link' => 'notices.html', 'sentAt' => $now
        );
    }
    if ($event === 'expiryDue') {
        return array(
            'event' => 'expiry.due_soon', 'eventLabel' => '效期临期',
            'title' => '原物料即将到期',
            'recordId' => 'ER0001', 'materialId' => 'EM01', 'materialName' => '生菜',
            'categoryId' => 'EC01', 'categoryName' => '冷藏', 'checkDate' => $today,
            'dueAt' => $today . ' 23:00:00', 'dueText' => $today . ' 23:00',
            'remainMinutes' => 30, 'registeredBy' => $display, 'note' => '',
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'expiry', 'link' => 'expiry.html', 'sentAt' => $now
        );
    }
    if ($event === 'expiryDaily') {
        $y = date('Y-m-d', strtotime($today . ' -1 day'));
        return array(
            'event' => 'expiry.daily', 'eventLabel' => '效期日报', 'title' => '今日到期物料汇总',
            'date' => $today, 'slot' => '09:00', 'slotKey' => '0900', 'count' => 2,
            'listText' => "1. 冷藏 / 生菜 · 23:00 · 登记 " . $display . "（" . $y . "） · 未处理\n"
                . "2. 冷冻 / 藤椒腿肉 · 18:00 · 登记 李婷（" . $y . "） · 已处理",
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'expiry', 'link' => 'expiry.html', 'sentAt' => $now
        );
    }
    if ($event === 'birthday') {
        return array(
            'event' => 'personal.birthday', 'eventLabel' => '个人提醒 · 生日关怀', 'channel' => 'personal',
            'title' => '生日快乐', 'messageType' => 'birthday', 'messageTypeLabel' => '生日关怀',
            'summary' => $display . '，生日快乐！愿你今天被温柔以待，忙里也有甜。',
            'sender' => '门店管理组', 'sentAt' => $now,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'link' => 'profile.html', 'page' => 'profile',
            'refId' => 'BIRTHDAY' . date('Y'), 'messageId' => 'BIRTHDAY' . date('Y'),
            'recipientId' => (string)$staff['id'], 'recipientName' => $display,
            'recipientRealName' => $name, 'recipientNickname' => $nickname,
            'recipientPhone' => $phone, 'recipientFeishuId' => $feishuId,
            'recipientFeishuStaffNo' => $feishuNo
        );
    }
    if ($event === 'shift') {
        $segText = "1. 10:00-14:00 前台站 · 补货与清洁\n2. 17:00-22:00 饮料站 · 备料与收档";
        return array(
            'event' => 'personal.shift', 'eventLabel' => '个人提醒 · 今日排班', 'channel' => 'personal',
            'title' => '今日排班已更新', 'messageType' => 'dailyShift', 'messageTypeLabel' => '今日排班',
            'summary' => '10:00-14:00 前台站 1. 10:00-14:00 前台站 · 补货与清洁 2. 17:00-22:00 饮料站 · 备料与收档',
            'sender' => '门店管理组', 'sentAt' => $now,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'link' => 'profile.html', 'page' => 'profile',
            'refId' => 'SHIFT-' . $today . '-' . $staff['id'], 'messageId' => 'SHIFT-' . $today . '-' . $staff['id'],
            'recipientId' => (string)$staff['id'], 'recipientName' => $display,
            'recipientRealName' => $name, 'recipientNickname' => $nickname,
            'recipientPhone' => $phone, 'recipientFeishuId' => $feishuId,
            'recipientFeishuStaffNo' => $feishuNo,
            'shiftDate' => $today,
            'shiftSegments' => array(
                array('segmentNo' => 1, 'startTime' => '10:00', 'endTime' => '14:00', 'station' => '前台站', 'task' => '补货与清洁'),
                array('segmentNo' => 2, 'startTime' => '17:00', 'endTime' => '22:00', 'station' => '饮料站', 'task' => '备料与收档')
            ),
            'shiftSegmentsText' => $segText,
            'shiftStartTime' => '10:00', 'shiftEndTime' => '14:00',
            'shiftStation' => '前台站', 'shiftTask' => '补货与清洁',
            'shiftReminder' => '高峰转低峰请随手清洁，并检查岗位物料归位与密封'
        );
    }
    if ($event === 'schedule') {
        return array(
            'event' => 'personal.schedule', 'eventLabel' => '个人提醒 · 日程', 'channel' => 'personal',
            'title' => '日程提醒：门店周会', 'messageType' => 'schedule', 'messageTypeLabel' => '日程提醒',
            'summary' => '讨论本周排班与新品推广。', 'sender' => $display, 'sentAt' => $now,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'link' => 'schedule.html', 'page' => 'schedule',
            'refId' => 'SC001', 'messageId' => 'SC001',
            'recipientId' => (string)$staff['id'], 'recipientName' => $display,
            'recipientRealName' => $name, 'recipientNickname' => $nickname,
            'recipientPhone' => $phone, 'recipientFeishuId' => $feishuId, 'recipientFeishuStaffNo' => $feishuNo,
            'scheduleId' => 'SC001', 'scheduleTitle' => '门店周会',
            'scheduleDate' => $today, 'scheduleStartTime' => '10:00', 'scheduleEndTime' => '11:00',
            'scheduleLocation' => '门店二楼', 'scheduleRemark' => '讨论本周排班与新品推广。',
            'remindText' => '提前 15 分钟', 'creatorName' => $display
        );
    }
    $eventKey = $event === 'test' ? 'test' : ($event === 'task' ? 'task' : ($event === 'private' ? 'private' : 'system'));
    $label = $eventKey === 'system' ? '系统/审批' : ($eventKey === 'task' ? '任务' : ($eventKey === 'private' ? '私信' : '测试'));
    return array(
        'event' => 'personal.' . $eventKey, 'eventLabel' => '个人提醒 · ' . $label,
        'channel' => 'personal',
        'title' => $eventKey === 'test' ? '个人提醒连通性测试' : ('个人提醒 · ' . $label),
        'messageType' => $eventKey === 'private' ? 'private' : ($eventKey === 'task' ? 'task' : 'system'),
        'messageTypeLabel' => $eventKey === 'private' ? '私信' : ($eventKey === 'task' ? '任务' : '系统通知'),
        'summary' => '这是一条示例摘要，用于预览模板渲染效果。',
        'sender' => '门店管理组', 'sentAt' => $now,
        'storeName' => $info['shortName'], 'storeCode' => $info['code'],
        'link' => 'messages.html', 'page' => 'messages',
        'refId' => 'TEST' . date('YmdHis'), 'messageId' => 'TEST' . date('YmdHis'),
        'recipientId' => (string)$staff['id'], 'recipientName' => $display,
        'recipientRealName' => $name, 'recipientNickname' => $nickname,
        'recipientPhone' => $phone, 'recipientFeishuId' => $feishuId,
        'recipientFeishuStaffNo' => $feishuNo
    );
}

function feishu_webhook_event_default_text($event, $payload)
{
    if ($event === 'taskDueSoon') return feishu_webhook_text($payload);
    if ($event === 'reminderOverdue') return feishu_reminder_text($payload);
    if ($event === 'noticePublished') return feishu_notice_text($payload);
    if ($event === 'expiryDue') return feishu_expiry_text($payload);
    if ($event === 'expiryDaily') return feishu_expiry_daily_text($payload);
    if ($event === 'test') {
        $p = $payload;
        $p['text'] = '';
        return feishu_personal_test_text($p);
    }
    if ($event === 'birthday') {
        return "【生日关怀】" . $payload['recipientName'] . "\n" . $payload['summary']
            . "\n发送人：" . $payload['sender'] . "\n时间：" . $payload['sentAt']
            . "\n门店：" . $payload['storeName'] . "\n（由门店人员管理系统推送）";
    }
    if ($event === 'shift') {
        $lines = array('【今日排班】' . $payload['recipientName'] . ' · ' . $payload['shiftDate'], $payload['shiftSegmentsText']);
        if (trim((string)$payload['shiftReminder']) !== '') $lines[] = '提醒：' . $payload['shiftReminder'];
        $lines[] = '发送人：' . $payload['sender'];
        $lines[] = '门店：' . $payload['storeName'];
        $lines[] = '（由门店人员管理系统推送）';
        return implode("\n", $lines);
    }
    if ($event === 'schedule') return feishu_schedule_text($payload);
    return feishu_personal_text($payload);
}

function api_webhook_preview($in)
{
    require_super();
    $event = in_str($in, 'event', 40, 'taskDueSoon');
    $allowed = array('taskDueSoon', 'reminderOverdue', 'noticePublished', 'expiryDue', 'expiryDaily', 'system', 'task', 'private', 'test', 'schedule', 'birthday', 'shift');
    if (!in_array($event, $allowed, true)) {
        throw new ApiException('未知的模板事件：' . ($event === '' ? '(空)' : $event) . '；允许的事件键：' . implode('、', $allowed));
    }
    $template = isset($in['template']) ? (string)$in['template'] : '';
    if (mb_strlen(trim($template), 'UTF-8') > 1000) throw new ApiException('模板不能超过 1000 字');
    $payload = feishu_webhook_sample_payload($event);
    $text = feishu_apply_template($template, $payload, feishu_webhook_event_default_text($event, $payload));
    $placeholders = array();
    foreach ($payload as $k => $v) {
        if (is_scalar($v) && $k !== 'text') $placeholders[] = $k;
    }
    sort($placeholders);
    return array('ok' => true, 'text' => $text, 'placeholders' => $placeholders);
}

function feishu_webhook_insert($event, $dedupeKey, $payload, $refType, $refId, $maxAttempts, $now, $channel = 'public', $recipientId = '')
{
    try {
        $st = db()->prepare('INSERT IGNORE INTO webhook_push_logs (event, channel, recipient_id, dedupe_key, ref_type, ref_id, status, attempts, max_attempts, payload_json, next_retry_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $st->execute(array(
            $event,
            $channel === 'personal' ? 'personal' : 'public',
            str_limit((string)$recipientId, 40),
            str_limit($dedupeKey, 120),
            $refType,
            str_limit($refId, 40),
            'pending', 0, max(1, (int)$maxAttempts),
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $now, $now, $now
        ));
        return $st->rowCount() > 0;
    } catch (Exception $e) {
        error_log('feishu_webhook_insert failed: ' . $e->getMessage());
        return false;
    }
}

function feishu_http_error_type($curlErrno, $error)
{
    $map = array(6 => 'dns', 7 => 'connect', 28 => 'timeout', 35 => 'ssl', 60 => 'ssl', 51 => 'ssl');
    if ($curlErrno && isset($map[$curlErrno])) return $map[$curlErrno];
    $e = strtolower((string)$error);
    if (strpos($e, 'timed out') !== false || strpos($e, 'timeout') !== false) return 'timeout';
    if (strpos($e, 'resolve') !== false || strpos($e, 'dns') !== false) return 'dns';
    if (strpos($e, 'ssl') !== false || strpos($e, 'certificate') !== false) return 'ssl';
    return 'connect';
}

/**
 * 投递一次 JSON POST。硬性超时：连接 2 秒 / 总计 4 秒。
 * 返回 ok、httpStatus、error、errorType、response、elapsedMs，任何环境都不允许无限等待。
 */
function feishu_webhook_http_post($url, $body, $connectTimeout = 2, $totalTimeout = 4)
{
    $start = microtime(true);
    $headers = array('Content-Type: application/json', 'Accept: application/json');
    $httpStatus = 0;
    $response = '';
    $error = '';
    $errorType = '';
    $connectTimeout = max(1, (int)$connectTimeout);
    $totalTimeout = max(2, (int)$totalTimeout);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        if ($ch === false) {
            return array(
                'ok' => false, 'httpStatus' => 0, 'response' => '',
                'error' => '环境异常：cURL 初始化失败', 'errorType' => 'unsupported',
                'elapsedMs' => (int)round((microtime(true) - $start) * 1000)
            );
        }
        curl_setopt_array($ch, array(
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => $connectTimeout,
            CURLOPT_TIMEOUT => $totalTimeout,
            CURLOPT_NOSIGNAL => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2
        ));
        $resp = curl_exec($ch);
        $httpStatus = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        if ($resp === false) {
            $error = curl_error($ch);
            if ($error === '') $error = '连接失败（cURL 错误 ' . $errno . '）';
            $errorType = feishu_http_error_type($errno, $error);
        } else {
            $response = (string)$resp;
        }
        curl_close($ch);
    } elseif (!in_array(strtolower(trim((string)ini_get('allow_url_fopen'))), array('0', 'off', 'no', 'false'), true) && function_exists('file_get_contents')) {
        $ctx = stream_context_create(array('http' => array(
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'timeout' => $totalTimeout,
            'ignore_errors' => true
        )));
        $resp = @file_get_contents($url, false, $ctx);
        if ($resp === false) {
            $error = '连接失败（stream 方式：无法连接目标地址或连接超时）';
            $errorType = 'connect';
        } else {
            $response = (string)$resp;
            if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
                $httpStatus = (int)$m[1];
            }
        }
    } else {
        return array(
            'ok' => false, 'httpStatus' => 0, 'response' => '',
            'error' => '环境不支持：未安装 cURL，且 allow_url_fopen 已关闭，无法发起 HTTP 请求',
            'errorType' => 'unsupported',
            'elapsedMs' => (int)round((microtime(true) - $start) * 1000)
        );
    }

    if ($error === '' && ($httpStatus < 200 || $httpStatus >= 300)) {
        if ($httpStatus === 0) {
            $error = '未收到有效 HTTP 响应';
            $errorType = 'response';
        } else {
            $error = 'HTTP ' . $httpStatus . '（目标返回非 2xx）';
            $errorType = 'http';
        }
    }
    return array(
        'ok' => $error === '',
        'httpStatus' => $httpStatus,
        'response' => str_limit(preg_replace('/\s+/', ' ', strip_tags($response)), 300),
        'error' => str_limit($error, 200),
        'errorType' => $error === '' ? '' : ($errorType === '' ? 'connect' : $errorType),
        'elapsedMs' => (int)round((microtime(true) - $start) * 1000)
    );
}

function feishu_webhook_deliver($row, $url, $connectTimeout = 2, $totalTimeout = 4)
{
    $payload = json_field($row['payload_json'], array());
    /* 标准 application/json：无 BOM、无外层包裹；非法 UTF-8 用替代字符，避免整包编码失败 */
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    $body = json_encode($payload, $flags);
    if ($body === false || $body === '') {
        $body = '{"event":"' . (isset($payload['event']) ? preg_replace('/[^A-Za-z0-9_.\-]/', '', (string)$payload['event']) : 'unknown')
            . '","title":"推送内容编码失败","text":"推送内容编码失败：请检查消息是否包含非法 UTF-8 字符"}';
    }
    $res = feishu_webhook_http_post($url, $body, $connectTimeout, $totalTimeout);

    $attempts = (int)$row['attempts'] + 1;
    $maxAttempts = max(1, (int)$row['max_attempts']);
    $now = now_dt();
    try {
        if ($res['ok']) {
            $st = db()->prepare("UPDATE webhook_push_logs SET status = 'success', attempts = ?, http_status = ?, response_text = ?, error = '', next_retry_at = NULL, sent_at = ?, updated_at = ? WHERE id = ?");
            $st->execute(array($attempts, $res['httpStatus'], $res['response'], $now, $now, $row['id']));
        } else {
            $exhausted = $attempts >= $maxAttempts;
            $next = null;
            if (!$exhausted) {
                $delay = min(900, 60 * (int)pow(2, max(0, $attempts - 1)));
                $next = date('Y-m-d H:i:s', time() + $delay);
            }
            $st = db()->prepare('UPDATE webhook_push_logs SET status = ?, attempts = ?, http_status = ?, response_text = ?, error = ?, next_retry_at = ?, updated_at = ? WHERE id = ?');
            $st->execute(array(
                $exhausted ? 'failed' : 'pending',
                $attempts, $res['httpStatus'], $res['response'],
                str_limit($res['error'], 255), $next, $now, $row['id']
            ));
        }
    } catch (Exception $e) {
        error_log('feishu_webhook_deliver update failed: ' . $e->getMessage());
    }
    return $res;
}

/* 任务完成 / 审核通过后，撤销尚未发送的逾期或到期提醒，避免“已完成仍推送” */
function feishu_cancel_task_pending($instanceId)
{
    $instanceId = (string)$instanceId;
    if ($instanceId === '') return;
    try {
        $st = db()->prepare("DELETE FROM webhook_push_logs WHERE status = 'pending' AND ref_type = 'task_instance' AND ref_id = ? AND event IN ('task.due_soon','reminder.overdue')");
        $st->execute(array($instanceId));
    } catch (Exception $e) { /* 忽略 */ }
}

/* 发送前复核目标状态：已完成 / 已提交的实例不再推送 */
function feishu_webhook_target_valid($row)
{
    $event = (string)$row['event'];
    if (!in_array($event, array('task.due_soon', 'reminder.overdue'), true)) return true;
    $refType = isset($row['ref_type']) ? (string)$row['ref_type'] : '';
    $ref = isset($row['ref_id']) ? (string)$row['ref_id'] : '';
    if ($ref === '') return true;
    try {
        if ($refType === 'task_instance') {
            $st = db()->prepare('SELECT status FROM task_instances WHERE id = ?');
            $st->execute(array($ref));
            $status = $st->fetchColumn();
            if ($status === false || $status === null) return false;
            if ($event === 'reminder.overdue') return $status === 'overdue';
            return in_array($status, array('pending', 'rejected'), true);
        }
        if ($event === 'task.due_soon' && $refType === 'task_group') {
            $p = json_decode(isset($row['payload_json']) ? (string)$row['payload_json'] : '', true);
            $period = is_array($p) && isset($p['periodDate']) ? (string)$p['periodDate'] : '';
            if ($period === '') return true;
            $st = db()->prepare("SELECT COUNT(*) FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id WHERE t.parent_id = ? AND i.period_date = ? AND i.status IN ('pending','rejected')");
            $st->execute(array($ref, $period));
            return (int)$st->fetchColumn() > 0;
        }
    } catch (Exception $e) {
        return true;
    }
    return true;
}

function feishu_webhook_flush($cfg, $limit = 2, $channel = 'public')
{
    if ($cfg['url'] === '' || !feishu_url_allowed($cfg['url'])) return 0;
    $limit = max(1, min(10, (int)$limit));
    $channel = $channel === 'personal' ? 'personal' : 'public';
    $now = now_dt();
    try {
        $st = db()->prepare("SELECT * FROM webhook_push_logs WHERE status = 'pending' AND channel = ? AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= ?) ORDER BY id ASC LIMIT " . $limit);
        $st->execute(array($channel, $now));
        $rows = $st->fetchAll();
    } catch (Exception $e) {
        return 0;
    }
    $sent = 0;
    $budget = isset($GLOBALS['feishu_webhook_budget_until']) ? (float)$GLOBALS['feishu_webhook_budget_until'] : 0;
    if ($budget <= 0) {
        /* 单次请求内所有通道合计最多占用约 8 秒，避免目标不响应拖慢页面 */
        $budget = microtime(true) + 8;
        $GLOBALS['feishu_webhook_budget_until'] = $budget;
    }
    try {
        $claim = db()->prepare("UPDATE webhook_push_logs SET next_retry_at = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND channel = ? AND (next_retry_at IS NULL OR next_retry_at <= ?)");
    } catch (Exception $e) {
        return 0;
    }
    foreach ($rows as $row) {
        if (microtime(true) >= $budget) break;
        /* 先占位再发送：并发访问时只有一个请求能拿到这条记录，避免重复推送 */
        try {
            $claim->execute(array(date('Y-m-d H:i:s', time() + 120), $now, $row['id'], $channel, $now));
            if ($claim->rowCount() === 0) continue;
        } catch (Exception $e) {
            continue;
        }
        /* 发送前复核：任务已完成 / 已提交时撤销该条推送 */
        if (!feishu_webhook_target_valid($row)) {
            try {
                $cancel = db()->prepare("UPDATE webhook_push_logs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?");
                $cancel->execute(array('目标已完成，取消推送', now_dt(), $row['id']));
            } catch (Exception $e) { /* 忽略 */ }
            continue;
        }
        feishu_webhook_deliver($row, $cfg['url']);
        $sent++;
    }
    return $sent;
}

/* 扫描进入「截止前 N 分钟」窗口且仍未提交的实例，生成去重后的待发送记录 */
function feishu_webhook_scan_due($cfg, $from = null, $to = null)
{
    $minutes = feishu_webhook_advance_minutes($cfg);
    $now = now_dt();
    $until = date('Y-m-d H:i:s', strtotime($now) + $minutes * 60);

    $sql = "SELECT i.id, i.template_id, i.period_date, i.deadline_at, i.assignee_id,
                   t.title, t.parent_id, pt.title AS group_title,
                   sa.name AS assignee_name, sa.nickname AS assignee_nickname
            FROM task_instances i
            INNER JOIN task_templates t ON t.id = i.template_id
            LEFT JOIN task_templates pt ON pt.id = t.parent_id
            LEFT JOIN staff sa ON sa.id = i.assignee_id
            WHERE i.status IN ('pending','rejected')
              AND i.published_at IS NOT NULL
              AND i.deadline_at IS NOT NULL
              AND i.deadline_at > ?
              AND i.deadline_at <= ?
              AND t.status = 'enabled'
              AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))";
    $args = array($now, $until);
    if ($from !== null && $to !== null) {
        $sql .= ' AND i.period_date >= ? AND i.period_date <= ?';
        $args[] = $from;
        $args[] = $to;
    }
    $sql .= ' ORDER BY i.deadline_at ASC LIMIT 80';

    try {
        $st = db()->prepare($sql);
        $st->execute($args);
        $rows = $st->fetchAll();
    } catch (Exception $e) {
        return 0;
    }

    $info = store_info();
    $inserted = 0;
    $groups = array();
    foreach ($rows as $r) {
        $isChild = isset($r['parent_id']) && $r['parent_id'] !== null && (string)$r['parent_id'] !== '';
        if ($isChild) {
            $gkey = (string)$r['parent_id'] . '|' . (string)$r['period_date'];
            if (!isset($groups[$gkey])) {
                $groups[$gkey] = array(
                    'parentId' => (string)$r['parent_id'],
                    'periodDate' => (string)$r['period_date'],
                    'groupTitle' => isset($r['group_title']) && $r['group_title'] !== '' ? (string)$r['group_title'] : (string)$r['title'],
                    'deadlineAt' => (string)$r['deadline_at']
                );
            }
            continue;
        }
        /* 独立任务（无子任务）：保持原有逐条推送 */
        $deadlineTs = strtotime($r['deadline_at']);
        $remain = $deadlineTs === false ? 0 : max(0, (int)floor(($deadlineTs - strtotime($now)) / 60));
        $payload = array(
            'event' => 'task.due_soon',
            'eventLabel' => '任务即将到期',
            'title' => '任务即将到期提醒',
            'taskTitle' => (string)$r['title'],
            'taskId' => (int)$r['id'],
            'groupId' => '',
            'groupTitle' => '',
            'periodDate' => (string)$r['period_date'],
            'deadlineAt' => (string)$r['deadline_at'],
            'deadlineText' => substr((string)$r['deadline_at'], 5, 11),
            'assignee' => isset($r['assignee_name']) ? display_name($r['assignee_name'], isset($r['assignee_nickname']) ? $r['assignee_nickname'] : '') : '',
            'storeName' => $info['shortName'],
            'storeCode' => $info['code'],
            'pendingCount' => 1,
            'approvedCount' => 0,
            'totalCount' => 1,
            'progressText' => '',
            'advanceMinutes' => $minutes,
            'remainMinutes' => $remain,
            'page' => 'tasks',
            'link' => 'tasks.html',
            'sentAt' => $now
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['taskDueSoon'], $payload, feishu_webhook_text($payload));
        $key = 'task.due_soon|' . $r['id'] . '|' . $minutes;
        if (feishu_webhook_insert('task.due_soon', $key, $payload, 'task_instance', (string)$r['id'], $cfg['maxRetries'], $now)) {
            $inserted++;
        }
    }

    /* 分组任务：按「母任务 + 执行日期」聚合，只为整组推一条 */
    foreach ($groups as $g) {
        try {
            $gs = db()->prepare("SELECT COUNT(*) AS total, SUM(i2.status = 'approved') AS approved
                                 FROM task_instances i2 INNER JOIN task_templates t2 ON t2.id = i2.template_id
                                 WHERE t2.parent_id = ? AND i2.period_date = ?");
            $gs->execute(array($g['parentId'], $g['periodDate']));
            $sum = $gs->fetch();
        } catch (Exception $e) {
            continue;
        }
        $total = $sum ? (int)$sum['total'] : 0;
        $approved = $sum && $sum['approved'] !== null ? (int)$sum['approved'] : 0;
        if ($total <= 0 || $approved >= $total) continue;   /* 整组已完成：不再推送 */
        $deadlineAt = (string)$g['deadlineAt'];
        if ($deadlineAt === '') continue;
        $deadlineTs = strtotime($deadlineAt);
        if ($deadlineTs === false || $deadlineTs <= strtotime($now) || $deadlineTs > strtotime($until)) continue;

        /* 指派人：去重后列出整组所有执行人，空表示全店公共任务 */
        $assignee = '';
        try {
            $as = db()->prepare("SELECT DISTINCT i2.assignee_id, s.name, s.nickname
                                 FROM task_instances i2 INNER JOIN task_templates t2 ON t2.id = i2.template_id
                                 LEFT JOIN staff s ON s.id = i2.assignee_id
                                 WHERE t2.parent_id = ? AND i2.period_date = ? AND i2.assignee_id <> ''");
            $as->execute(array($g['parentId'], $g['periodDate']));
            $names = array();
            foreach ($as->fetchAll() as $a) {
                $n = display_name(isset($a['name']) ? $a['name'] : '', isset($a['nickname']) ? $a['nickname'] : '');
                if ($n !== '') $names[$n] = true;
            }
            $assignee = implode('、', array_keys($names));
        } catch (Exception $e) {
            $assignee = '';
        }

        $remain = max(0, (int)floor(($deadlineTs - strtotime($now)) / 60));
        $pending = $total - $approved;
        $payload = array(
            'event' => 'task.due_soon',
            'eventLabel' => '任务即将到期',
            'title' => '门店任务即将到期',
            'taskTitle' => $g['groupTitle'],
            'taskId' => 0,
            'groupId' => $g['parentId'],
            'groupTitle' => $g['groupTitle'],
            'periodDate' => $g['periodDate'],
            'deadlineAt' => $deadlineAt,
            'deadlineText' => substr($deadlineAt, 5, 11),
            'assignee' => $assignee,
            'storeName' => $info['shortName'],
            'storeCode' => $info['code'],
            'pendingCount' => $pending,
            'approvedCount' => $approved,
            'totalCount' => $total,
            'progressText' => $approved . '/' . $total,
            'advanceMinutes' => $minutes,
            'remainMinutes' => $remain,
            'page' => 'tasks',
            'link' => 'tasks.html',
            'sentAt' => $now
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['taskDueSoon'], $payload, feishu_webhook_text($payload));
        $key = 'task.due_soon.group|' . $g['parentId'] . '|' . $g['periodDate'] . '|' . $minutes;
        if (feishu_webhook_insert('task.due_soon', $key, $payload, 'task_group', $g['parentId'], $cfg['maxRetries'], $now)) {
            $inserted++;
        }
    }
    return $inserted;
}

/* 扫描已逾期的「任务提醒」实例，按「提醒模板 + 执行日期 + 公共通道」去重后入队 */
function feishu_webhook_scan_reminder_overdue($cfg, $from = null, $to = null)
{
    $now = now_dt();
    $since = date('Y-m-d H:i:s', strtotime($now) - 30 * 86400);
    $sql = "SELECT i.id, i.template_id, i.period_date, i.deadline_at, i.assignee_id,
                   t.title, t.content, t.parent_id, pt.title AS group_title,
                   sa.name AS assignee_name, sa.nickname AS assignee_nickname
            FROM task_instances i
            INNER JOIN task_templates t ON t.id = i.template_id
            LEFT JOIN task_templates pt ON pt.id = t.parent_id
            LEFT JOIN staff sa ON sa.id = i.assignee_id
            WHERE i.status = 'overdue'
              AND i.published_at IS NOT NULL
              AND i.deadline_at IS NOT NULL
              AND i.deadline_at <= ?
              AND i.deadline_at >= ?
              AND t.kind = 'reminder'
              AND t.status = 'enabled'
              AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))";
    $args = array($now, $since);
    if ($from !== null && $to !== null) {
        $sql .= ' AND i.period_date >= ? AND i.period_date <= ?';
        $args[] = $from;
        $args[] = $to;
    }
    $sql .= ' ORDER BY i.deadline_at ASC LIMIT 80';

    try {
        $st = db()->prepare($sql);
        $st->execute($args);
        $rows = $st->fetchAll();
    } catch (Exception $e) {
        return 0;
    }

    $info = store_info();
    $inserted = 0;
    foreach ($rows as $r) {
        /* 分组提醒：整组已完成时不再推送 */
        if (!empty($r['parent_id'])) {
            try {
                $gs = db()->prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN i2.status = 'approved' THEN 1 ELSE 0 END) AS approved FROM task_instances i2 INNER JOIN task_templates t2 ON t2.id = i2.template_id WHERE t2.parent_id = ? AND i2.period_date = ?");
                $gs->execute(array($r['parent_id'], $r['period_date']));
                $g = $gs->fetch();
                if ($g && (int)$g['total'] > 0 && (int)$g['approved'] >= (int)$g['total']) continue;
            } catch (Exception $e) { /* 忽略，按未完成处理 */ }
        }
        $payload = array(
            'event' => 'reminder.overdue',
            'eventLabel' => '提醒已逾期',
            'title' => '门店提醒已逾期',
            'taskTitle' => (string)$r['title'],
            'groupTitle' => isset($r['group_title']) ? (string)$r['group_title'] : '',
            'reminderId' => (string)$r['template_id'],
            'taskId' => (int)$r['id'],
            'periodDate' => (string)$r['period_date'],
            'deadlineAt' => (string)$r['deadline_at'],
            'deadlineText' => substr((string)$r['deadline_at'], 5, 11),
            'assignee' => isset($r['assignee_name']) ? display_name($r['assignee_name'], isset($r['assignee_nickname']) ? $r['assignee_nickname'] : '') : '',
            'storeName' => $info['shortName'],
            'storeCode' => $info['code'],
            'page' => 'tasks',
            'link' => 'tasks.html?tab=reminder',
            'sentAt' => $now
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['reminderOverdue'], $payload, feishu_reminder_text($payload));
        $key = 'reminder.overdue|' . $r['template_id'] . '|' . $r['period_date'] . '|public';
        if (feishu_webhook_insert('reminder.overdue', $key, $payload, 'task_instance', (string)$r['id'], $cfg['maxRetries'], $now)) {
            $inserted++;
        }
    }
    return $inserted;
}

/**
 * 效期临期：登记的原物料到期前 30 分钟推送一次。
 * 去重键 = 记录ID + 到期时间（同日重填改了到期时间可再推一次）；已处理/已报废的不推。
 * 只取「到期前一天登记、次日到期」的记录，与当天到期页、日报同一口径。
 */
function feishu_webhook_scan_expiry($cfg)
{
    $now = now_dt();
    $nowTs = strtotime($now);
    if (!$nowTs) return 0;
    $until = date('Y-m-d H:i:s', $nowTs + 30 * 60);
    $st = db()->prepare("SELECT * FROM expiry_records WHERE status = 'normal' AND check_date = DATE_SUB(DATE(due_at), INTERVAL 1 DAY) AND due_at > ? AND due_at <= ? ORDER BY due_at ASC LIMIT 50");
    $st->execute(array($now, $until));
    $rows = $st->fetchAll();
    if (!$rows) return 0;
    $info = store_info();
    $created = 0;
    foreach ($rows as $r) {
        $dueAt = (string)$r['due_at'];
        $dueTs = strtotime($dueAt);
        $payload = array(
            'event' => 'expiry.due_soon', 'eventLabel' => '效期临期', 'title' => '原物料即将到期',
            'recordId' => $r['id'], 'materialId' => $r['material_id'],
            'materialName' => (string)$r['material_name'], 'categoryId' => (string)$r['category_id'],
            'categoryName' => (string)$r['category_name'], 'checkDate' => (string)$r['check_date'],
            'dueAt' => $dueAt, 'dueText' => substr($dueAt, 0, 16),
            'remainMinutes' => $dueTs ? max(0, (int)round(($dueTs - $nowTs) / 60)) : 0,
            'registeredBy' => (string)$r['created_by'], 'note' => (string)$r['note'],
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'expiry', 'link' => 'expiry.html', 'sentAt' => $now
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['expiryDue'], $payload, feishu_expiry_text($payload));
        feishu_webhook_insert('expiry.due_soon', 'expiry.due_soon|' . $r['id'] . '|' . $dueAt, $payload, 'expiry', $r['id'], $cfg['maxRetries'], $now);
        $created++;
    }
    return $created;
}

/**
 * 效期日报：每天 09:00、15:00 各推一次。
 * 取数口径与临期推送一致：到期前一天登记、当天到期，且排除已处理/已报废。
 * 无可用记录时该档不推；两档各自用 expiry.daily|{日期}|{0900/1500} 去重。
 */
function feishu_webhook_scan_expiry_daily($cfg)
{
    $today = date('Y-m-d');
    $nowTs = time();
    $slots = array(
        array('key' => '0900', 'label' => '09:00'),
        array('key' => '1500', 'label' => '15:00')
    );
    $dueSlots = array();
    foreach ($slots as $s) {
        if (strtotime($today . ' ' . $s['label']) <= $nowTs) $dueSlots[] = $s;
    }
    if (!$dueSlots) return 0;

    try {
        $st = db()->prepare("SELECT * FROM expiry_records WHERE DATE(due_at) = ? AND check_date = DATE_SUB(?, INTERVAL 1 DAY) AND status NOT IN ('processed','scrapped') ORDER BY due_at ASC, id ASC");
        $st->execute(array($today, $today));
        $rows = $st->fetchAll();
    } catch (Exception $e) {
        return 0;
    }
    if (!$rows) return 0;

    $info = store_info();
    $now = now_dt();
    $listText = feishu_expiry_daily_list_text($rows);
    $count = count($rows);
    $created = 0;
    foreach ($dueSlots as $slot) {
        $key = 'expiry.daily|' . $today . '|' . $slot['key'];
        $payload = array(
            'event' => 'expiry.daily', 'eventLabel' => '效期日报', 'title' => '今日到期物料汇总',
            'date' => $today, 'slot' => $slot['label'], 'slotKey' => $slot['key'],
            'count' => $count, 'listText' => $listText,
            'storeName' => $info['shortName'], 'storeCode' => $info['code'],
            'page' => 'expiry', 'link' => 'expiry.html', 'sentAt' => $now
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['expiryDaily'], $payload, feishu_expiry_daily_text($payload));
        if (feishu_webhook_insert('expiry.daily', $key, $payload, 'expiry_daily', $today, $cfg['maxRetries'], $now)) {
            $created++;
        }
    }
    return $created;
}

/**
 * 惰性推进入口：任务接口被访问时由 task_ensure_instances 调用。
 * 任何异常都吞掉，绝不影响任务主流程。
 */
function feishu_webhook_tick($from = null, $to = null)
{
    /* 同一请求内只推进一次，避免 task_ensure_instances 被多次调用时重复扫描/发送 */
    static $done = false;
    if ($done) return 0;
    $done = true;
    try {
        /* 个人提醒通道：顺带补发失败/待重试队列（与公共通道互不影响） */
        try {
            $pcfg = personal_webhook_config();
            if ($pcfg['enabled'] && $pcfg['url'] !== '' && feishu_url_allowed($pcfg['url'])) {
                feishu_webhook_flush($pcfg, 1, 'personal');
            }
        } catch (Exception $e) {
            error_log('personal webhook retry failed: ' . $e->getMessage());
        }
        $cfg = feishu_webhook_config();
        if (!$cfg['enabled']) return 0;
        $created = 0;
        if ($cfg['url'] !== '' && feishu_url_allowed($cfg['url'])) {
            if (!empty($cfg['events']['taskDueSoon'])) {
                $created += feishu_webhook_scan_due($cfg, $from, $to);
            }
            if (!empty($cfg['events']['reminderOverdue'])) {
                $created += feishu_webhook_scan_reminder_overdue($cfg, $from, $to);
            }
            if (!empty($cfg['events']['expiryDue'])) {
                $created += feishu_webhook_scan_expiry($cfg);
            }
            if (!empty($cfg['events']['expiryDaily'])) {
                $created += feishu_webhook_scan_expiry_daily($cfg);
            }
        }
        feishu_webhook_flush($cfg);
        return $created;
    } catch (Exception $e) {
        error_log('feishu_webhook_tick failed: ' . $e->getMessage());
        return 0;
    }
}

/* ---------------- 通知发布事件 ---------------- */

/**
 * 通知真正发布时投递。
 * 去重代次 = 该通知已有的通知发布推送记录数 + 1：
 * - 首次发布 / 撤回后重新发布 → 代次递增，可以再推一次；
 * - 编辑标题或重复保存已发布通知 → 不调用本函数，不会重复推。
 */
function feishu_webhook_notice_publish($noticeId, $scheduled = false)
{
    try {
        $cfg = feishu_webhook_config();
        if (!$cfg['enabled'] || empty($cfg['events']['noticePublished'])) return false;
        if ($cfg['url'] === '' || !feishu_url_allowed($cfg['url'])) return false;

        $st = db()->prepare('SELECT * FROM notices WHERE id = ?');
        $st->execute(array((string)$noticeId));
        $r = $st->fetch();
        if (!$r || $r['status'] !== 'published') return false;

        $info = store_info();
        $summary = notice_webhook_summary($r['body'], 100);
        $publishedAt = !empty($r['published_at']) ? (string)$r['published_at'] : now_dt();
        $flagged = array();
        if (!empty($r['important'])) $flagged[] = '重要';
        if (!empty($r['pinned'])) $flagged[] = '置顶';
        $isScheduled = $scheduled || !empty($r['publish_at']);

        $payload = array(
            'event' => 'notices.published',
            'eventLabel' => '通知发布',
            'title' => '门店通知发布',
            'noticeId' => (string)$r['id'],
            'category' => notice_category_norm($r['category']),
            'noticeTitle' => (string)$r['title'],
            'summary' => $summary,
            'publisher' => (string)$r['publisher'],
            'publishedAt' => $publishedAt,
            'important' => !empty($r['important']),
            'pinned' => !empty($r['pinned']),
            'scheduled' => $isScheduled,
            'scheduledText' => $isScheduled ? '定时发布' : '立即发布',
            'noticeLink' => app_public_url('notice.html?id=' . rawurlencode((string)$r['id'])),
            'flags' => implode('、', $flagged),
            'storeName' => $info['shortName'],
            'storeCode' => $info['code'],
            'page' => 'notices',
            'link' => 'notices.html',
            'sentAt' => now_dt()
        );
        $payload['text'] = feishu_apply_template($cfg['templates']['noticePublished'], $payload, feishu_notice_text($payload));

        $st = db()->prepare("SELECT COUNT(*) FROM webhook_push_logs WHERE event = 'notices.published' AND ref_id = ?");
        $st->execute(array((string)$r['id']));
        $gen = (int)$st->fetchColumn() + 1;
        $key = 'notices.published|' . $r['id'] . '|' . $gen;
        $ok = feishu_webhook_insert('notices.published', $key, $payload, 'notice', (string)$r['id'], $cfg['maxRetries'], now_dt());
        if ($ok) feishu_webhook_flush($cfg);
        return $ok;
    } catch (Exception $e) {
        error_log('feishu_webhook_notice_publish failed: ' . $e->getMessage());
        return false;
    }
}

/* ---------------- 个人提醒事件 ---------------- */

function personal_webhook_event_of_type($type)
{
    if ($type === 'task') return 'task';
    if ($type === 'private') return 'private';
    if ($type === 'birthday') return 'birthday';
    if ($type === 'dailyShift') return 'shift';
    return 'system';
}

function personal_webhook_type_label($type)
{
    $map = array(
        'leave' => '排休审批',
        'shift' => '排班审批',
        'reimburse' => '报销状态',
        'task' => '任务指派与审核',
        'private' => '私信',
        'feedback' => '匿名反馈',
        'birthday' => '生日关怀',
        'dailyShift' => '今日排班',
        'system' => '系统通知'
    );
    return isset($map[$type]) ? $map[$type] : '站内消息';
}

function personal_webhook_page($link)
{
    $page = (string)$link;
    $q = strpos($page, '?');
    if ($q !== false) $page = substr($page, 0, $q);
    if (substr($page, -5) === '.html') $page = substr($page, 0, -5);
    return $page;
}

/**
 * 个人提醒：给单个员工产生的站内消息。
 * 失败只写日志，绝不抛出；同一条消息（messageId）只推一次。
 */
function personal_webhook_push($staffId, $type, $title, $body, $link, $messageId, $senderName = '', $extra = array())
{
    try {
        $cfg = personal_webhook_config();
        if (!$cfg['enabled'] || $cfg['url'] === '' || !feishu_url_allowed($cfg['url'])) return false;
        $eventKey = personal_webhook_event_of_type($type);
        if (empty($cfg['events'][$eventKey])) return false;

        $staff = staff_by_id((string)$staffId);
        if (!$staff) return false;
        $info = store_info();
        $now = now_dt();
        $name = isset($staff['name']) ? (string)$staff['name'] : '';
        $nickname = isset($staff['nickname']) ? (string)$staff['nickname'] : '';
        $displayName = display_name($name, $nickname);
        $phone = isset($staff['phone']) ? (string)$staff['phone'] : '';
        $feishuId = isset($staff['feishu_id']) ? (string)$staff['feishu_id'] : '';
        $feishuStaffNo = isset($staff['feishu_emp_no']) ? (string)$staff['feishu_emp_no'] : '';
        $summary = notice_webhook_summary($body, 100);
        $sender = trim((string)$senderName) !== '' ? (string)$senderName : '门店管理组';
        $typeLabel = personal_webhook_type_label($type);
        $eventLabels = array('system' => '系统/审批', 'task' => '任务', 'private' => '私信', 'schedule' => '日程', 'birthday' => '生日关怀', 'shift' => '今日排班');

        $payload = array(
            'event' => 'personal.' . $eventKey,
            'eventLabel' => '个人提醒 · ' . (isset($eventLabels[$eventKey]) ? $eventLabels[$eventKey] : $eventKey),
            'channel' => 'personal',
            'title' => (string)$title,
            'messageType' => (string)$type,
            'messageTypeLabel' => $typeLabel,
            'summary' => $summary,
            'sender' => $sender,
            'sentAt' => $now,
            'storeName' => $info['shortName'],
            'storeCode' => $info['code'],
            'link' => (string)$link,
            'page' => personal_webhook_page($link),
            'refId' => isset($extra['refId']) ? (string)$extra['refId'] : (string)$messageId,
            'messageId' => (string)$messageId,
            'recipientId' => (string)$staffId,
            'recipientName' => $displayName,
            'recipientRealName' => $name,
            'recipientNickname' => $nickname,
            'recipientPhone' => $phone,
            'recipientFeishuId' => $feishuId,
            'recipientFeishuStaffNo' => $feishuStaffNo
        );
        if (!empty($extra['payloadFields']) && is_array($extra['payloadFields'])) {
            foreach ($extra['payloadFields'] as $k => $v) {
                $payload[$k] = $v;
            }
        }
        $tplKey = in_array($eventKey, array('system', 'task', 'private', 'birthday', 'shift'), true) ? $eventKey : 'system';
        /* 预览与实际发送共用同一套默认文案（shift / birthday 已单独定义） */
        $payload['text'] = feishu_apply_template($cfg['templates'][$tplKey], $payload, feishu_webhook_event_default_text($tplKey, $payload));

        $key = !empty($extra['dedupeKey']) ? (string)$extra['dedupeKey'] : ('personal.message|' . ($messageId !== '' ? $messageId : uniqid('pm', true)));
        $ok = feishu_webhook_insert('personal.' . $eventKey, $key, $payload, 'message', (string)$messageId, $cfg['maxRetries'], $now, 'personal', (string)$staffId);
        if ($ok) feishu_webhook_flush($cfg, 2, 'personal');
        return $ok;
    } catch (Exception $e) {
        error_log('personal_webhook_push failed: ' . $e->getMessage());
        return false;
    }
}

/* ---------------- 接口 ---------------- */

function feishu_webhook_log_out($r)
{
    $payload = json_field($r['payload_json'], array());
    $labels = array('pending' => '待发送/重试中', 'success' => '成功', 'failed' => '失败');
    return array(
        'id' => (int)$r['id'],
        'event' => $r['event'],
        'eventLabel' => feishu_webhook_event_label($r['event']),
        'channel' => isset($r['channel']) && $r['channel'] === 'personal' ? 'personal' : 'public',
        'recipientId' => isset($r['recipient_id']) ? (string)$r['recipient_id'] : '',
        'recipientName' => isset($payload['recipientName']) ? (string)$payload['recipientName'] : '',
        'recipientPhone' => isset($payload['recipientPhone']) ? (string)$payload['recipientPhone'] : '',
        'recipientFeishuId' => isset($payload['recipientFeishuId']) ? (string)$payload['recipientFeishuId'] : '',
        'messageTypeLabel' => isset($payload['messageTypeLabel']) ? (string)$payload['messageTypeLabel'] : '',
        'status' => $r['status'],
        'statusLabel' => isset($labels[$r['status']]) ? $labels[$r['status']] : $r['status'],
        'attempts' => (int)$r['attempts'],
        'maxAttempts' => (int)$r['max_attempts'],
        'httpStatus' => (int)$r['http_status'],
        'error' => (string)$r['error'],
        'response' => (string)$r['response_text'],
        'simulated' => false,
        'taskTitle' => isset($payload['taskTitle']) ? (string)$payload['taskTitle'] : (isset($payload['noticeTitle']) ? (string)$payload['noticeTitle'] : (isset($payload['title']) ? (string)$payload['title'] : '')),
        'store' => isset($payload['storeName']) ? (string)$payload['storeName'] : '',
        'deadlineAt' => isset($payload['deadlineAt']) ? (string)$payload['deadlineAt'] : '',
        'nextRetryAt' => iso($r['next_retry_at']),
        'createdAt' => iso($r['created_at']),
        'sentAt' => iso($r['sent_at'])
    );
}

/* 测试接口专用：异常也必须落一条失败记录并返回结构化结果 */
function feishu_webhook_safe_deliver($row, $url, $connectTimeout = 2, $totalTimeout = 4)
{
    try {
        return feishu_webhook_deliver($row, $url, $connectTimeout, $totalTimeout);
    } catch (Exception $e) {
        $msg = '发送异常：' . $e->getMessage();
        try {
            $st = db()->prepare("UPDATE webhook_push_logs SET status = 'failed', attempts = 1, error = ?, updated_at = ? WHERE id = ?");
            $st->execute(array(str_limit($msg, 255), now_dt(), $row['id']));
        } catch (Exception $e2) {
            /* 忽略：记录更新失败不影响返回结果 */
        }
        return array(
            'ok' => false, 'httpStatus' => 0, 'response' => '',
            'error' => str_limit($msg, 200), 'errorType' => 'exception', 'elapsedMs' => 0
        );
    }
}

function api_webhook_test($in)
{
    @set_time_limit(20);
    @ini_set('max_execution_time', '20');
    require_super();
    $cfg = feishu_webhook_config();
    $url = trim((string)in_str($in, 'url', 500));
    if ($url === '') $url = $cfg['url'];
    if ($url === '') throw new ApiException('请先填写飞书多维表格自动化 webhook 地址');
    if (!feishu_url_allowed($url)) throw new ApiException('webhook 地址不合法：仅支持公网 http/https 地址');

    $info = store_info();
    $now = now_dt();
    $testId = 'TEST' . date('YmdHis');
    $payload = array(
        'event' => 'test',
        'eventLabel' => '测试推送',
        'channel' => 'public',
        'title' => '飞书 webhook 连通性测试',
        'messageType' => 'test',
        'messageTypeLabel' => '测试推送',
        'summary' => '这是系统设置页发送的公共通道测试消息，收到即表示地址可达。',
        'sender' => '门店管理组',
        'sentAt' => $now,
        'storeName' => $info['shortName'],
        'storeCode' => $info['code'],
        'link' => 'admin-settings.html',
        'page' => 'admin-settings',
        'refId' => $testId,
        'messageId' => $testId,
        'text' => "【测试推送】" . $info['shortName'] . "\n这是系统设置页发送的测试消息，收到即表示地址可达。\n发送时间：" . $now . "\n（由门店人员管理系统推送）"
    );
    $key = 'test|' . date('YmdHis') . '|' . substr(md5(uniqid('', true)), 0, 8);
    if (!feishu_webhook_insert('test', $key, $payload, '', '', 1, $now)) {
        throw new ApiException('写入推送记录失败，请确认已执行最新数据库迁移');
    }
    $st = db()->prepare('SELECT * FROM webhook_push_logs WHERE dedupe_key = ?');
    $st->execute(array($key));
    $row = $st->fetch();
    if (!$row) throw new ApiException('推送记录写入失败');

    $res = feishu_webhook_safe_deliver($row, $url, 3, 8);
    audit_log('发送飞书推送测试', '系统设置', ($res['ok'] ? '成功' : '失败') . ' · HTTP ' . $res['httpStatus'] . ' · ' . $res['elapsedMs'] . 'ms');
    return array(
        'ok' => $res['ok'],
        'simulated' => false,
        'httpStatus' => $res['httpStatus'],
        'errorType' => isset($res['errorType']) ? $res['errorType'] : '',
        'error' => $res['error'],
        'response' => $res['response'],
        'elapsedMs' => $res['elapsedMs'],
        'logId' => (int)$row['id']
    );
}

function api_personal_webhook_test($in)
{
    @set_time_limit(20);
    @ini_set('max_execution_time', '20');
    $acc = require_super();
    $cfg = personal_webhook_config();
    $url = trim((string)in_str($in, 'url', 500));
    if ($url === '') $url = $cfg['url'];
    if ($url === '') throw new ApiException('请先填写个人提醒 webhook 地址');
    if (!feishu_url_allowed($url)) throw new ApiException('个人提醒 webhook 地址不合法：仅支持公网 http/https 地址');

    $staff = staff_by_id(isset($acc['staff_id']) ? (string)$acc['staff_id'] : '');
    if (!$staff) throw new ApiException('未找到当前账号的员工档案');
    $info = store_info();
    $now = now_dt();
    $name = isset($staff['name']) ? (string)$staff['name'] : '';
    $nickname = isset($staff['nickname']) ? (string)$staff['nickname'] : '';
    $displayName = display_name($name, $nickname);
    $phone = isset($staff['phone']) ? (string)$staff['phone'] : '';
    $feishuId = isset($staff['feishu_id']) ? (string)$staff['feishu_id'] : '';
    $feishuStaffNo = isset($staff['feishu_emp_no']) ? (string)$staff['feishu_emp_no'] : '';
    $testId = 'TEST' . date('YmdHis');
    $payload = array(
        'event' => 'personal.test',
        'eventLabel' => '个人提醒 · 测试',
        'channel' => 'personal',
        'title' => '个人提醒连通性测试',
        'messageType' => 'system',
        'messageTypeLabel' => '系统通知',
        'summary' => '这是系统设置页发送的个人提醒测试消息，收到即表示地址可达。',
        'sender' => '门店管理组',
        'sentAt' => $now,
        'storeName' => $info['shortName'],
        'storeCode' => $info['code'],
        'link' => 'messages.html',
        'page' => 'messages',
        'refId' => $testId,
        'messageId' => $testId,
        'recipientId' => (string)$staff['id'],
        'recipientName' => $displayName,
        'recipientRealName' => $name,
        'recipientNickname' => $nickname,
        'recipientPhone' => $phone,
        'recipientFeishuId' => $feishuId,
        'recipientFeishuStaffNo' => $feishuStaffNo
    );
    $personalCfg = personal_webhook_config();
    $payload['text'] = feishu_apply_template($personalCfg['templates']['test'], $payload, feishu_personal_test_text($payload));

    $key = 'personal.test|' . date('YmdHis') . '|' . substr(md5(uniqid('', true)), 0, 8);
    if (!feishu_webhook_insert('personal.test', $key, $payload, '', '', 1, $now, 'personal', (string)$staff['id'])) {
        throw new ApiException('写入个人提醒记录失败，请确认已执行最新数据库迁移');
    }
    $st = db()->prepare('SELECT * FROM webhook_push_logs WHERE dedupe_key = ?');
    $st->execute(array($key));
    $row = $st->fetch();
    if (!$row) throw new ApiException('个人提醒记录写入失败');

    $res = feishu_webhook_safe_deliver($row, $url, 3, 8);
    audit_log('发送个人提醒测试', '系统设置', ($res['ok'] ? '成功' : '失败') . ' · HTTP ' . $res['httpStatus'] . ' · ' . $res['elapsedMs'] . 'ms');
    return array(
        'ok' => $res['ok'],
        'simulated' => false,
        'httpStatus' => $res['httpStatus'],
        'errorType' => isset($res['errorType']) ? $res['errorType'] : '',
        'error' => $res['error'],
        'response' => $res['response'],
        'elapsedMs' => $res['elapsedMs'],
        'logId' => (int)$row['id'],
        'recipientName' => $displayName
    );
}

function api_webhook_logs($in)
{
    require_super();
    /* 最近推送记录：后端分页，默认每页 10 条，按时间倒序 */
    $page = in_int($in, 'page', 10);
    if ($page < 1) $page = 1;
    $pageSize = in_int($in, 'pageSize', 10);
    if ($pageSize < 1 || $pageSize > 50) $pageSize = 10;
    $offset = ($page - 1) * $pageSize;
    $channel = in_str($in, 'channel', 16);
    $where = '';
    $args = array();
    if ($channel === 'public' || $channel === 'personal') {
        $where = ' WHERE channel = ?';
        $args[] = $channel;
    }
    $list = array();
    try {
        $cst = db()->prepare('SELECT COUNT(*) FROM webhook_push_logs' . $where);
        $cst->execute($args);
        $total = (int)$cst->fetchColumn();

        $st = db()->prepare('SELECT * FROM webhook_push_logs' . $where . ' ORDER BY created_at DESC, id DESC LIMIT ' . $pageSize . ' OFFSET ' . $offset);
        $st->execute($args);
        foreach ($st->fetchAll() as $r) $list[] = feishu_webhook_log_out($r);
    } catch (Exception $e) {
        return array('list' => array(), 'total' => 0, 'page' => 1, 'pageSize' => $pageSize, 'totalPages' => 1, 'simulated' => false, 'migrationRequired' => true);
    }
    return array(
        'list' => $list,
        'total' => $total,
        'page' => $page,
        'pageSize' => $pageSize,
        'totalPages' => $total > 0 ? (int)ceil($total / $pageSize) : 1,
        'simulated' => false
    );
}
