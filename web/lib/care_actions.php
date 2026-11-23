<?php
/* care_actions.php — 员工关怀：生日当天自动站内通知 + 飞书个人提醒
 *
 * 不依赖 cron：由每次页面都会调用的 api_message_unread() 惰性推进，
 * 数据库唯一键 (staff_id, year) + 个人 webhook 去重键双重保证同人同年只发一次。
 */

function birthday_care_config()
{
    $s = settings_data();
    $cfg = isset($s['birthdayCare']) && is_array($s['birthdayCare']) ? $s['birthdayCare'] : array();
    return array(
        'enabled' => array_key_exists('enabled', $cfg) ? !empty($cfg['enabled']) : true,
        'template' => isset($cfg['template']) ? (string)$cfg['template'] : ''
    );
}

function birthday_default_text($displayName)
{
    return $displayName . '，生日快乐！愿你今天被温柔以待，忙里也有甜；谢谢你把认真和用心带进店里，新的一岁，万事顺意。';
}

/* 占位符：{name} {displayName} {year} {storeName}；留空使用默认文案 */
function birthday_render_text($template, $payload)
{
    $t = trim((string)$template);
    if ($t === '') return '';
    return preg_replace_callback('/\{([A-Za-z0-9_]+)\}/', function ($m) use ($payload) {
        $k = $m[1];
        if (!array_key_exists($k, $payload)) return $m[0];
        return (string)$payload[$k];
    }, $t);
}

/**
 * 当天生日关怀扫描（幂等）。
 * 返回本次实际发出的通知数；旧库未执行迁移时静默返回 0。
 */
function birthday_tick()
{
    try {
        $cfg = birthday_care_config();
        if (!$cfg['enabled']) return 0;

        $tz = function_exists('task_timezone') ? task_timezone() : new DateTimeZone('Asia/Shanghai');
        $now = new DateTimeImmutable('now', $tz);
        $year = (int)$now->format('Y');
        $month = (int)$now->format('n');
        $day = (int)$now->format('j');

        $st = db()->prepare("SELECT id, name, nickname, birth FROM staff WHERE status = 'active' AND birth IS NOT NULL AND MONTH(birth) = ? AND DAY(birth) = ?");
        $st->execute(array($month, $day));
        $rows = $st->fetchAll();
        if (!$rows) return 0;

        $info = store_info();
        $ins = db()->prepare('INSERT IGNORE INTO birthday_greetings (staff_id, year, created_at) VALUES (?,?,?)');
        $sent = 0;
        foreach ($rows as $r) {
            $ins->execute(array($r['id'], $year, now_dt()));
            if ($ins->rowCount() === 0) continue; /* 同人同年只发一次 */

            $name = isset($r['name']) ? (string)$r['name'] : '';
            $nickname = isset($r['nickname']) ? (string)$r['nickname'] : '';
            $display = display_name($name, $nickname);
            $body = birthday_render_text($cfg['template'], array(
                'name' => $name,
                'displayName' => $display,
                'year' => $year,
                'storeName' => $info['shortName']
            ));
            if (trim($body) === '') $body = birthday_default_text($display);
            if (function_exists('str_limit')) $body = str_limit($body, 480);

            push_message(
                $r['id'],
                'birthday',
                '生日快乐',
                $body,
                'profile.html',
                (string)$year,
                'personal.birthday|' . $r['id'] . '|' . $year
            );
            $sent++;
        }
        return $sent;
    } catch (Exception $e) {
        error_log('birthday_tick failed: ' . $e->getMessage());
        return 0;
    }
}
