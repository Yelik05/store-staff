<?php
/* push_actions.php — App 通知
 *
 * 两段式设计：
 * A. 本地通知（已可用）：notify.feed 聚合任务/私信/审批/排班/生日/公告事件，
 *    App 用 WorkManager + 前台轮询拉取并弹本地通知，未配置任何推送凭据也能工作。
 * B. 远程推送（预留）：app_device_tokens 存设备 Token；push_send_fcm / push_send_apns
 *    为可插拔发送方法，配置凭据后即可启用；未配置时返回 NOT_CONFIGURED，不影响 A。
 */

function notify_event_out($id, $category, $title, $body, $route, $refId, $createdAt, $level = 'normal')
{
    return array(
        'id' => (string)$id,
        'category' => (string)$category,
        'title' => (string)$title,
        'body' => (string)$body,
        'route' => (string)$route,
        'refId' => (string)$refId,
        'createdAt' => (string)$createdAt,
        'level' => (string)$level
    );
}

function notify_plain_text($text, $max = 120)
{
    $s = trim(preg_replace('/\s+/u', ' ', strip_tags((string)$text)));
    return str_limit($s, $max);
}

/* 聚合通知事件：App 轮询一次即可拿到全部待提醒项 */
function api_notify_feed($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $staffId = (string)$staff['id'];
    $today = today_d();
    $now = time();
    $events = array();

    /* 1. 今日排班（每天一条，事件 ID 固定，天然幂等） */
    if (function_exists('daily_shift_records') && function_exists('daily_shift_segments_text')) {
        $records = daily_shift_records($staffId, $today);
        if (!empty($records)) {
            $body = daily_shift_segments_text($records);
            $events[] = notify_event_out(
                'shift:' . $today,
                'shift',
                '今日排班',
                $body,
                'home',
                $today,
                $today . 'T00:00:00'
            );
        }
    }

    /* 2. 任务：即将到期（2 小时内）与逾期（3 天内） */
    $todayPending = 0;
    $overdueCount = 0;
    try {
        $st = db()->prepare("SELECT i.id, i.status, i.deadline_at, t.title, t.cycle
            FROM task_instances i
            INNER JOIN task_templates t ON t.id = i.template_id
            WHERE i.published_at IS NOT NULL
              AND i.deadline_at IS NOT NULL
              AND i.status IN ('pending', 'submitted', 'rejected', 'overdue')
              AND (i.assignee_id = '' OR i.assignee_id = ?)
              AND t.status = 'enabled'
              AND t.parent_id IS NOT NULL
              AND i.deadline_at <= DATE_ADD(NOW(), INTERVAL 2 HOUR)
              AND i.deadline_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
            ORDER BY i.deadline_at ASC
            LIMIT 20");
        $st->execute(array($staffId));
        foreach ($st->fetchAll() as $r) {
            $due = strtotime((string)$r['deadline_at']);
            $isOverdue = $due <= $now;
            if ($isOverdue) {
                $overdueCount++;
            } else {
                $todayPending++;
            }
            $deadlineText = date('m-d H:i', $due);
            $events[] = notify_event_out(
                'task:' . $r['id'] . ':' . ($isOverdue ? 'overdue' : 'soon'),
                'task',
                $isOverdue ? '任务已逾期' : '任务即将到期',
                (string)$r['title'] . ' · 截止 ' . $deadlineText,
                'tasks',
                (string)$r['id'],
                iso($r['deadline_at']),
                $isOverdue ? 'high' : 'normal'
            );
        }
    } catch (Exception $e) {
        /* 任务表缺失时跳过该分类 */
    }

    /* 3. 未读站内消息（私信 / 审批结果 / 任务 / 生日 / 公告 / 系统） */
    $unreadMessages = 0;
    try {
        $st = db()->prepare('SELECT COUNT(*) FROM messages WHERE staff_id = ? AND read_at IS NULL');
        $st->execute(array($staffId));
        $unreadMessages = (int)$st->fetchColumn();

        $st = db()->prepare('SELECT id, type, title, body, ref_id, created_at
            FROM messages WHERE staff_id = ? AND read_at IS NULL
            ORDER BY created_at DESC LIMIT 20');
        $st->execute(array($staffId));
        foreach ($st->fetchAll() as $r) {
            $type = (string)$r['type'];
            $category = 'system';
            if ($type === 'private') $category = 'message';
            elseif (in_array($type, array('leave', 'shift', 'reimburse', 'approval'), true)) $category = 'approval';
            elseif ($type === 'task') $category = 'task';
            elseif ($type === 'birthday') $category = 'birthday';
            elseif ($type === 'notice') $category = 'notice';
            $events[] = notify_event_out(
                'message:' . $r['id'],
                $category,
                (string)$r['title'],
                notify_plain_text($r['body'], 120),
                'messages',
                (string)$r['id'],
                iso($r['created_at'])
            );
        }
    } catch (Exception $e) {
        /* 消息表缺失时跳过 */
    }

    /* 4. 未读公告（没有对应消息记录时的兜底） */
    try {
        $st = db()->prepare("SELECT n.id, n.title, n.body, n.published_at
            FROM notices n
            LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.staff_id = ?
            WHERE n.status = 'published' AND r.id IS NULL
            ORDER BY n.pinned DESC, n.published_at DESC
            LIMIT 10");
        $st->execute(array($staffId));
        foreach ($st->fetchAll() as $r) {
            $events[] = notify_event_out(
                'notice:' . $r['id'],
                'notice',
                '新公告：' . (string)$r['title'],
                notify_plain_text($r['body'], 100),
                'messages',
                (string)$r['id'],
                iso($r['published_at'])
            );
        }
    } catch (Exception $e) {
        /* 公告表缺失时跳过 */
    }

    return array(
        'serverTime' => date('c'),
        'events' => $events,
        'counts' => array(
            'unreadMessages' => $unreadMessages,
            'todayPending' => $todayPending,
            'overdue' => $overdueCount
        )
    );
}

/* ---------------- 设备 Token 登记 ---------------- */

function api_push_register($in)
{
    $acc = require_login();
    $platform = strtolower(in_str($in, 'platform', 16));
    if (!in_array($platform, array('android', 'ios'), true)) {
        throw new ApiException('不支持的平台', 'BAD_PLATFORM', 400);
    }
    $token = trim((string)(isset($in['token']) ? $in['token'] : ''));
    if (strlen($token) < 20) throw new ApiException('设备 Token 无效', 'BAD_DEVICE_TOKEN', 400);

    $now = now_dt();
    $deviceName = in_str($in, 'deviceName', 80);
    $appVersion = in_str($in, 'appVersion', 20);
    $staffId = (string)$acc['staff_id'];

    $st = db()->prepare('SELECT id FROM app_device_tokens WHERE platform = ? AND token = ? LIMIT 1');
    $st->execute(array($platform, $token));
    $row = $st->fetch();
    if ($row) {
        $id = (string)$row['id'];
        $q = db()->prepare('UPDATE app_device_tokens SET account_id = ?, staff_id = ?, device_name = ?, app_version = ?, updated_at = ?, last_seen_at = ?, revoked_at = NULL WHERE id = ?');
        $q->execute(array($acc['id'], $staffId, $deviceName, $appVersion, $now, $now, $id));
    } else {
        $id = 'DT' . date('YmdHis') . bin2hex(random_bytes(4));
        $q = db()->prepare('INSERT INTO app_device_tokens (id, account_id, staff_id, platform, token, device_name, app_version, created_at, updated_at, last_seen_at, revoked_at) VALUES (?,?,?,?,?,?,?,?,?,?,NULL)');
        $q->execute(array($id, $acc['id'], $staffId, $platform, $token, $deviceName, $appVersion, $now, $now, $now));
    }

    return array('id' => $id, 'platform' => $platform, 'registeredAt' => iso($now));
}

function api_push_unregister($in)
{
    $acc = require_login();
    $token = trim((string)(isset($in['token']) ? $in['token'] : ''));
    if ($token === '') {
        /* 未给具体 Token 时，撤销该账号全部设备，用于退出登录 */
        $q = db()->prepare('UPDATE app_device_tokens SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL');
        $q->execute(array(now_dt(), $acc['id']));
        return array('ok' => true, 'scope' => 'all');
    }
    $q = db()->prepare('UPDATE app_device_tokens SET revoked_at = ? WHERE token = ? AND account_id = ? AND revoked_at IS NULL');
    $q->execute(array(now_dt(), $token, $acc['id']));
    return array('ok' => true, 'scope' => 'token');
}

function api_push_status($in)
{
    $acc = require_login();
    $st = db()->prepare('SELECT platform, COUNT(*) AS total FROM app_device_tokens WHERE account_id = ? AND revoked_at IS NULL GROUP BY platform');
    $st->execute(array($acc['id']));
    $devices = array();
    foreach ($st->fetchAll() as $r) {
        $devices[(string)$r['platform']] = (int)$r['total'];
    }
    return array(
        'devices' => $devices,
        'fcmConfigured' => push_fcm_configured(),
        'apnsConfigured' => push_apns_configured()
    );
}

/* ---------------- 远程推送预留（可插拔） ---------------- */

function push_config()
{
    $cfg = app_config();
    return isset($cfg['push']) && is_array($cfg['push']) ? $cfg['push'] : array();
}

function push_fcm_configured()
{
    $c = push_config();
    return !empty($c['fcmServerKey']) || !empty($c['fcmServiceAccount']);
}

function push_apns_configured()
{
    $c = push_config();
    return !empty($c['apnsKeyId']) && !empty($c['apnsTeamId']) && !empty($c['apnsPrivateKey']);
}

/**
 * FCM 发送（预留）。配置 config.php 的 push.fcmServerKey 后启用 legacy HTTP 发送；
 * 新项目建议改用 HTTP v1（服务账号 OAuth），替换本函数内部实现即可，调用方无需改动。
 */
function push_send_fcm($deviceToken, $title, $body, $data = array())
{
    $c = push_config();
    $key = isset($c['fcmServerKey']) ? trim((string)$c['fcmServerKey']) : '';
    if ($key === '') return array('ok' => false, 'reason' => 'FCM_NOT_CONFIGURED');
    if (!function_exists('curl_init')) return array('ok' => false, 'reason' => 'CURL_NOT_AVAILABLE');

    $payload = json_encode(array(
        'to' => $deviceToken,
        'notification' => array('title' => $title, 'body' => $body),
        'data' => $data
    ), JSON_UNESCAPED_UNICODE);
    $ch = curl_init('https://fcm.googleapis.com/fcm/send');
    curl_setopt_array($ch, array(
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => array(
            'Authorization: key=' . $key,
            'Content-Type: application/json'
        ),
        CURLOPT_POSTFIELDS => $payload
    ));
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($resp === false) return array('ok' => false, 'reason' => 'CURL_ERROR', 'detail' => $err);
    return array('ok' => $code >= 200 && $code < 300, 'httpStatus' => $code, 'response' => str_limit((string)$resp, 200));
}

/**
 * APNs 发送（预留）。
 * 接入步骤：config.php 增加 push.apnsKeyId / apnsTeamId / apnsPrivateKey(P8 路径)，
 * 使用 HTTP/2 + JWT 调用 api.push.apple.com；未配置时返回 NOT_CONFIGURED。
 */
function push_send_apns($deviceToken, $title, $body, $data = array())
{
    if (!push_apns_configured()) return array('ok' => false, 'reason' => 'APNS_NOT_CONFIGURED');
    /* 预留：在此实现 JWT + HTTP/2 请求；当前版本不发起网络调用 */
    return array('ok' => false, 'reason' => 'APNS_NOT_IMPLEMENTED');
}

/**
 * 服务端下发入口：按员工推送一个事件到其全部有效设备。
 * 同一 eventId + 设备只投递一次（app_push_deliveries 去重）。
 */
function push_dispatch_to_staff($staffId, $event)
{
    $eventId = isset($event['id']) ? (string)$event['id'] : '';
    $title = isset($event['title']) ? (string)$event['title'] : '';
    $body = isset($event['body']) ? (string)$event['body'] : '';
    if ($eventId === '' || $title === '') return array('ok' => false, 'reason' => 'BAD_EVENT');

    $st = db()->prepare('SELECT * FROM app_device_tokens WHERE staff_id = ? AND revoked_at IS NULL');
    $st->execute(array((string)$staffId));
    $devices = $st->fetchAll();
    if (!$devices) return array('ok' => true, 'sent' => 0, 'skipped' => 0);

    $sent = 0;
    $skipped = 0;
    foreach ($devices as $d) {
        $deviceId = (string)$d['id'];
        try {
            $q = db()->prepare('SELECT id FROM app_push_deliveries WHERE event_id = ? AND device_id = ? LIMIT 1');
            $q->execute(array($eventId, $deviceId));
            if ($q->fetch()) { $skipped++; continue; }
        } catch (Exception $e) {
            /* 日志表缺失时不阻断发送 */
        }

        $platform = (string)$d['platform'];
        $result = $platform === 'ios'
            ? push_send_apns((string)$d['token'], $title, $body, array('eventId' => $eventId))
            : push_send_fcm((string)$d['token'], $title, $body, array('eventId' => $eventId));

        try {
            $q = db()->prepare('INSERT INTO app_push_deliveries (event_id, device_id, channel, status, detail, created_at) VALUES (?,?,?,?,?,?)');
            $q->execute(array(
                $eventId,
                $deviceId,
                $platform === 'ios' ? 'apns' : 'fcm',
                !empty($result['ok']) ? 'sent' : 'failed',
                str_limit(isset($result['reason']) ? (string)$result['reason'] : '', 200),
                now_dt()
            ));
        } catch (Exception $e) {
            /* 去重记录失败不影响结果 */
        }
        if (!empty($result['ok'])) $sent++;
    }
    return array('ok' => true, 'sent' => $sent, 'skipped' => $skipped);
}
