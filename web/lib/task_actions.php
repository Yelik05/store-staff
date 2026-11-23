<?php
/* task_actions.php — 任务下发：任务模板、按周期惰性生成实例、店员提交返图、管理端审核 */

function task_cycles()
{
    return array(
        'once' => '一次性',
        'daily' => '日循环',
        'weekly' => '周循环',
        'monthly' => '月循环'
    );
}

function task_weekdays()
{
    return array(1 => '周一', 2 => '周二', 3 => '周三', 4 => '周四', 5 => '周五', 6 => '周六', 7 => '周日');
}

function task_status_labels()
{
    return array(
        'pending' => '待完成',
        'submitted' => '待审核',
        'approved' => '已通过',
        'rejected' => '已驳回',
        'overdue' => '已逾期'
    );
}

function task_status_label($s)
{
    $m = task_status_labels();
    return isset($m[$s]) ? $m[$s] : $s;
}

/* ---------------- 任务类型字典 ---------------- */

/* 类型 ID → 名称（含停用类型，保证历史任务照常展示原类型名） */
function task_kind_map()
{
    static $map = null;
    if ($map !== null) return $map;
    $map = array();
    try {
        foreach (db()->query('SELECT id, name FROM task_kinds') as $r) {
            $map[$r['id']] = $r['name'];
        }
    } catch (Exception $e) {
        $map = array('sys' => '系统任务', 'reminder' => '运营通提醒');
    }
    return $map;
}

function task_kind_name($id)
{
    $id = (string)$id;
    if ($id === '') $id = 'sys';
    $m = task_kind_map();
    return isset($m[$id]) ? $m[$id] : '系统任务';
}

/* 模板引用数：含停用与历史模板，决定是否允许物理删除 */
function task_kind_usage()
{
    $out = array();
    foreach (db()->query('SELECT kind_id, COUNT(*) AS n FROM task_templates GROUP BY kind_id') as $r) {
        $out[(string)$r['kind_id']] = (int)$r['n'];
    }
    return $out;
}

function task_kind_out($r, $usage)
{
    $id = (string)$r['id'];
    return array(
        'id' => $id,
        'name' => $r['name'],
        'sortOrder' => (int)$r['sort_order'],
        'enabled' => !empty($r['enabled']),
        'builtin' => !empty($r['builtin']),
        'usage' => isset($usage[$id]) ? $usage[$id] : 0
    );
}

function task_kind_list($includeDisabled = true)
{
    $usage = task_kind_usage();
    $sql = 'SELECT * FROM task_kinds' . ($includeDisabled ? '' : ' WHERE enabled = 1') . ' ORDER BY sort_order ASC, name ASC';
    $out = array();
    foreach (db()->query($sql) as $r) $out[] = task_kind_out($r, $usage);
    return $out;
}

/* ---------------- 时间与时区 ---------------- */

/**
 * 任务时间统一使用配置时区（默认 Asia/Shanghai）的「墙上时间」。
 * 数据库不存 UTC，也不做偏移换算，因此夏令时 / 服务器时区变化不会让同一期次错位。
 */
function task_timezone()
{
    $cfg = app_config();
    $tz = isset($cfg['app']['timezone']) ? (string)$cfg['app']['timezone'] : '';
    if ($tz === '') $tz = 'Asia/Shanghai';
    try {
        return new DateTimeZone($tz);
    } catch (Exception $e) {
        return new DateTimeZone('Asia/Shanghai');
    }
}

function task_is_time($v)
{
    return (bool)preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', trim((string)$v));
}

/* 统一为 HH:MM:SS；非法值回退默认值 */
function task_normalize_time($v, $default)
{
    $v = trim((string)$v);
    if (preg_match('/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/', $v, $m)) {
        return $m[1] . ':' . $m[2] . ':' . (isset($m[3]) && $m[3] !== '' ? $m[3] : '00');
    }
    return $default;
}

function task_hm($time)
{
    return substr(task_normalize_time($time, '00:00:00'), 0, 5);
}

/* 期次日期 + 时分 -> 该时区的绝对墙上时间字符串 Y-m-d H:i:s */
function task_period_at($date, $time)
{
    $dt = new DateTimeImmutable($date . ' ' . task_normalize_time($time, '00:00:00'), task_timezone());
    return $dt->format('Y-m-d H:i:s');
}

function task_schedule_label($publish, $deadline)
{
    return task_hm($publish) . ' 发布 · ' . task_hm($deadline) . ' 截止';
}

/**
 * 推进任务状态（只依赖服务端时间）：
 * 1) 到达发布时间：published_at 为空则写入 publish_at；
 * 2) 超过截止时间且仍未完成（pending / rejected）：转为 overdue。
 * submitted / approved 不参与逾期判定。
 */
function task_advance_states($from = null, $to = null)
{
    $now = now_dt();
    $range = '';
    if ($from !== null && $to !== null) {
        $range = ' AND period_date >= ? AND period_date <= ?';
    }

    $args = array($now);
    if ($range !== '') { $args[] = $from; $args[] = $to; }
    $st = db()->prepare('UPDATE task_instances SET published_at = publish_at WHERE published_at IS NULL AND publish_at IS NOT NULL AND publish_at <= ?' . $range);
    $st->execute($args);
    $published = $st->rowCount();

    $args = array($now, $now);
    if ($range !== '') { $args[] = $from; $args[] = $to; }
    $st = db()->prepare("UPDATE task_instances SET status = 'overdue', updated_at = ? WHERE status IN ('pending','rejected') AND published_at IS NOT NULL AND deadline_at IS NOT NULL AND deadline_at < ?" . $range);
    $st->execute($args);
    $overdue = $st->rowCount();

    return array('published' => $published, 'overdue' => $overdue);
}

/**
 * 模板发布时间 / 截止时间变更后，重算该模板已有实例的绝对时间。
 * - 发布时间已到且尚未发布：立即补发布；
 * - 发布时间被改晚且期次仍未完成：清空 published_at，使其重新隐藏；
 * - 已完成 / 待审核期次只更新时间，不改发布可见性。
 */
function task_sync_instance_schedule($templateId, $publishTime, $deadlineTime)
{
    $now = now_dt();
    $st = db()->prepare('SELECT id, period_date, status, published_at FROM task_instances WHERE template_id = ?');
    $st->execute(array($templateId));
    $rows = $st->fetchAll();
    if (!$rows) return 0;

    $up = db()->prepare('UPDATE task_instances SET publish_at = ?, deadline_at = ?, published_at = ?, updated_at = ? WHERE id = ?');
    foreach ($rows as $r) {
        $pub = task_period_at($r['period_date'], $publishTime);
        $dl = task_period_at($r['period_date'], $deadlineTime);
        $publishedAt = $r['published_at'];
        $unfinished = in_array($r['status'], array('pending', 'rejected', 'overdue'), true);
        if ($pub > $now) {
            if ($unfinished) $publishedAt = null;
        } elseif ($publishedAt === null || $publishedAt === '') {
            $publishedAt = $pub;
        }
        $up->execute(array($pub, $dl, $publishedAt, $now, $r['id']));
    }
    task_advance_states();
    return count($rows);
}

function task_weekday_list($raw)
{
    $out = array();
    foreach (explode(',', (string)$raw) as $v) {
        $n = (int)trim($v);
        if ($n >= 1 && $n <= 7 && !in_array($n, $out, true)) $out[] = $n;
    }
    sort($out);
    return $out;
}

function task_weekday_text($raw)
{
    $wd = task_weekdays();
    $names = array();
    foreach (task_weekday_list($raw) as $n) {
        if (isset($wd[$n])) $names[] = $wd[$n];
    }
    return implode('、', $names);
}

function task_cycle_label($r)
{
    $cycles = task_cycles();
    $base = isset($cycles[$r['cycle']]) ? $cycles[$r['cycle']] : $r['cycle'];
    if ($r['cycle'] === 'weekly') {
        $text = task_weekday_text($r['weekdays']);
        return $base . ' · ' . ($text !== '' ? $text : '未设置');
    }
    if ($r['cycle'] === 'monthly') {
        return $base . ' · 每月 ' . (int)$r['month_day'] . ' 号';
    }
    return $base;
}

function task_template_row($id)
{
    $st = db()->prepare('SELECT * FROM task_templates WHERE id = ?');
    $st->execute(array($id));
    $r = $st->fetch();
    return $r ? $r : null;
}

/* 母任务下的子任务（一级，按创建时间正序） */
function task_children($parentId)
{
    $st = db()->prepare('SELECT * FROM task_templates WHERE parent_id = ? ORDER BY created_at ASC, id ASC');
    $st->execute(array($parentId));
    return $st->fetchAll();
}

/* 母任务 id 集合：有子任务的模板只作为分组容器，不生成可提交实例 */
function task_group_id_map()
{
    $map = array();
    foreach (db()->query('SELECT DISTINCT parent_id FROM task_templates WHERE parent_id IS NOT NULL')->fetchAll() as $r) {
        $map[$r['parent_id']] = true;
    }
    return $map;
}

/* 适用门店：store_codes 为空表示全部门店，否则为逗号分隔的门店代号 */
function task_store_match($tpl, $code)
{
    $codes = trim((string)$tpl['store_codes']);
    if ($codes === '') return true;
    foreach (explode(',', $codes) as $c) {
        if (trim($c) === (string)$code) return true;
    }
    return false;
}

/**
 * 枚举模板在 [$from, $to] 区间内应存在的期间日期。
 * 一次性任务只取 start_date（不受回看下限限制，便于补齐历史漏项）。
 */
function task_cycle_dates($tpl, $from, $to)
{
    $start = (string)$tpl['start_date'];
    if ($start === '' || $start === '0000-00-00') return array();
    $cycle = $tpl['cycle'];
    if ($cycle === 'once') {
        return $start <= $to ? array($start) : array();
    }
    $lo = $from > $start ? $from : $start;
    $hi = $to;
    if (!empty($tpl['end_date']) && $tpl['end_date'] < $hi) $hi = $tpl['end_date'];
    if ($lo > $hi) return array();

    $weekdays = task_weekday_list($tpl['weekdays']);
    $monthDay = (int)$tpl['month_day'];
    if ($cycle === 'weekly' && !$weekdays) return array();
    if ($cycle === 'monthly' && ($monthDay < 1 || $monthDay > 31)) return array();

    $out = array();
    $tz = task_timezone();
    $cursor = new DateTimeImmutable($lo . ' 00:00:00', $tz);
    $last = new DateTimeImmutable($hi . ' 00:00:00', $tz);
    for (; $cursor <= $last; $cursor = $cursor->modify('+1 day')) {
        if ($cycle === 'daily') {
            $out[] = $cursor->format('Y-m-d');
        } elseif ($cycle === 'weekly') {
            /* ISO-8601：周一=1 … 周日=7，与后台勾选值一致 */
            if (in_array((int)$cursor->format('N'), $weekdays, true)) $out[] = $cursor->format('Y-m-d');
        } elseif ($cycle === 'monthly') {
            $dim = (int)$cursor->format('t');
            $target = min($monthDay, $dim);
            if ((int)$cursor->format('j') === $target) $out[] = $cursor->format('Y-m-d');
        }
    }
    return $out;
}

/**
 * 惰性补齐任务实例（幂等）。
 * 默认窗口：今天前 30 天 ~ 今天后 7 天；唯一键 (template_id, period_date) 保证重复调用不产生重复数据。
 *
 * @param string|null $from     起始日期，null 表示默认回看 30 天
 * @param string|null $to       截止日期，null 表示默认前瞻 7 天
 * @param string      $storeCode 仅补该门店的模板；空串表示全部
 * @return int 本次新增实例数
 */
function task_ensure_instances($from = null, $to = null, $storeCode = '')
{
    $tz = task_timezone();
    if ($to === null) $to = (new DateTimeImmutable(today_d(), $tz))->modify('+7 days')->format('Y-m-d');
    if ($from === null) $from = (new DateTimeImmutable(today_d(), $tz))->modify('-30 days')->format('Y-m-d');

    $st = db()->prepare("SELECT * FROM task_templates WHERE status = 'enabled' AND start_date <= ?");
    $st->execute(array($to));
    $rows = $st->fetchAll();
    if (!$rows) {
        task_advance_states($from, $to);
        if (function_exists('feishu_webhook_tick')) feishu_webhook_tick($from, $to);
        return 0;
    }

    $groups = task_group_id_map();
    $statusOf = array();
    foreach (db()->query('SELECT id, status FROM task_templates')->fetchAll() as $x) {
        $statusOf[$x['id']] = $x['status'];
    }

    $ins = db()->prepare('INSERT IGNORE INTO task_instances (template_id, period_date, assignee_id, completion_mode, completion_scope, status, publish_at, deadline_at, published_at, created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?)');
    $created = 0;
    foreach ($rows as $tpl) {
        /* 母任务只是分组容器，不生成实例 */
        if (isset($groups[$tpl['id']])) continue;
        /* 母任务停用时，子任务一并停止生成 */
        $pid = isset($tpl['parent_id']) ? (string)$tpl['parent_id'] : '';
        if ($pid !== '' && isset($statusOf[$pid]) && $statusOf[$pid] !== 'enabled') continue;
        if ($storeCode !== '' && !task_store_match($tpl, $storeCode)) continue;
        $assignee = isset($tpl['assignee_id']) ? (string)$tpl['assignee_id'] : '';
        $mode = isset($tpl['completion_mode']) && $tpl['completion_mode'] === 'confirm' ? 'confirm' : 'upload';
        $scope = isset($tpl['completion_scope']) && $tpl['completion_scope'] === 'all' ? 'all' : 'any';
        $pubTime = task_normalize_time(isset($tpl['publish_time']) ? $tpl['publish_time'] : '', '00:00:00');
        $dlTime = task_normalize_time(isset($tpl['deadline_time']) ? $tpl['deadline_time'] : '', '23:59:59');
        $dates = task_cycle_dates($tpl, $from, $to);
        $expected = array_flip($dates);

        /* 模板改过循环/星期/每月几号/生效日期后，清理窗口内不再符合规则的未完成期次；
           已提交/已通过的历史记录保留，不回溯删除。 */
        $stale = db()->prepare("SELECT id, period_date FROM task_instances WHERE template_id = ? AND period_date >= ? AND period_date <= ? AND status IN ('pending','rejected','overdue')");
        $stale->execute(array($tpl['id'], $from, $to));
        $staleIds = array();
        foreach ($stale->fetchAll() as $x) {
            if (!isset($expected[$x['period_date']])) $staleIds[] = (int)$x['id'];
        }
        if ($staleIds) {
            $del = db()->prepare('DELETE FROM task_instances WHERE id IN (' . implode(',', array_fill(0, count($staleIds), '?')) . ')');
            $del->execute($staleIds);
        }

        foreach ($dates as $d) {
            $ins->execute(array($tpl['id'], $d, $assignee, $mode, $scope, 'pending', task_period_at($d, $pubTime), task_period_at($d, $dlTime), now_dt()));
            $created += $ins->rowCount();
        }
    }
    /* 惰性推进：补齐后立即按服务端时间发布 / 转逾期 */
    task_advance_states($from, $to);
    /* 任务即将到期：沿访问时的惰性推进触发飞书 webhook（内部吞掉全部异常） */
    if (function_exists('feishu_webhook_tick')) feishu_webhook_tick($from, $to);
    return $created;
}

function task_template_out($r)
{
    return array(
        'id' => $r['id'],
        'title' => $r['title'],
        'content' => $r['content'],
        'parentId' => isset($r['parent_id']) && $r['parent_id'] !== null ? (string)$r['parent_id'] : '',
        'assigneeId' => isset($r['assignee_id']) ? (string)$r['assignee_id'] : '',
        'assigneeOverride' => !empty($r['assignee_override']),
        'completionMode' => isset($r['completion_mode']) && $r['completion_mode'] === 'confirm' ? 'confirm' : 'upload',
        'completionLabel' => isset($r['completion_mode']) && $r['completion_mode'] === 'confirm' ? '仅需确认' : '附件上传',
        'completionScope' => isset($r['completion_scope']) && $r['completion_scope'] === 'all' ? 'all' : 'any',
        'completionScopeLabel' => isset($r['completion_scope']) && $r['completion_scope'] === 'all' ? '全员提交' : '任意一人提交',
        'publishTime' => task_hm(isset($r['publish_time']) ? $r['publish_time'] : '00:00:00'),
        'deadlineTime' => task_hm(isset($r['deadline_time']) ? $r['deadline_time'] : '23:59:59'),
        'scheduleLabel' => task_schedule_label(isset($r['publish_time']) ? $r['publish_time'] : '00:00:00', isset($r['deadline_time']) ? $r['deadline_time'] : '23:59:59'),
        'cycle' => $r['cycle'],
        'kindId' => isset($r['kind_id']) && $r['kind_id'] !== '' ? (string)$r['kind_id'] : 'sys',
        'kindName' => task_kind_name(isset($r['kind_id']) ? $r['kind_id'] : 'sys'),
        'kind' => isset($r['kind_id']) && $r['kind_id'] !== '' ? (string)$r['kind_id'] : 'sys',
        'cycleLabel' => task_cycle_label($r),
        'weekdays' => task_weekday_list($r['weekdays']),
        'monthDay' => (int)$r['month_day'],
        'startDate' => $r['start_date'],
        'endDate' => $r['end_date'] ? $r['end_date'] : '',
        'storeCodes' => $r['store_codes'],
        'sampleImages' => task_row_sample_images($r, 'sample_images_json'),
        'status' => $r['status'],
        'createdBy' => $r['created_by'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at'])
    );
}

/* 读取行内示例图 JSON；列不存在或为空时返回空数组 */
function task_row_sample_images($r, $key)
{
    if (!isset($r[$key]) || $r[$key] === null || $r[$key] === '') return array();
    return array_values(json_field($r[$key], array()));
}

/* 子任务未单独上传示例图时回落到母任务（$r 需带 group_sample_images） */
function task_effective_sample_images($r)
{
    $own = task_row_sample_images($r, 'sample_images_json');
    if ($own) return $own;
    return task_row_sample_images($r, 'group_sample_images');
}

function task_instance_out($r)
{
    $assigneeId = isset($r['assignee_id']) ? (string)$r['assignee_id'] : '';
    $parentId = isset($r['parent_id']) && $r['parent_id'] !== null ? (string)$r['parent_id'] : '';
    $assigneeSource = $assigneeId === '' ? 'public' : ($parentId !== '' && empty($r['assignee_override']) ? 'inherit' : 'self');
    $publishAt = isset($r['publish_at']) ? (string)$r['publish_at'] : '';
    $deadlineAt = isset($r['deadline_at']) ? (string)$r['deadline_at'] : '';
    $publishedAt = isset($r['published_at']) ? (string)$r['published_at'] : '';
    return array(
        'id' => (int)$r['id'],
        'templateId' => $r['template_id'],
        'parentId' => $parentId,
        'groupTitle' => isset($r['group_title']) ? (string)$r['group_title'] : '',
        'title' => $r['title'],
        'content' => $r['content'],
        'cycle' => $r['cycle'],
        'kindId' => isset($r['kind_id']) && $r['kind_id'] !== '' ? (string)$r['kind_id'] : 'sys',
        'kindName' => task_kind_name(isset($r['kind_id']) ? $r['kind_id'] : 'sys'),
        'kind' => isset($r['kind_id']) && $r['kind_id'] !== '' ? (string)$r['kind_id'] : 'sys',
        'cycleLabel' => task_cycle_label($r),
        'periodDate' => $r['period_date'],
        'publishAt' => $publishAt,
        'deadlineAt' => $deadlineAt,
        'publishedAt' => $publishedAt,
        'publishText' => $publishAt !== '' ? substr($publishAt, 0, 16) : '',
        'deadlineText' => $deadlineAt !== '' ? substr($deadlineAt, 0, 16) : '',
        'isPublished' => $publishedAt !== '',
        'assigneeId' => $assigneeId,
        'assigneeName' => isset($r['assignee_name']) ? (string)$r['assignee_name'] : '',
        'assigneeDisplayName' => display_name(isset($r['assignee_name']) ? $r['assignee_name'] : '', isset($r['assignee_nickname']) ? $r['assignee_nickname'] : ''),
        'assigneeSource' => $assigneeSource,
        'assigneeSourceLabel' => $assigneeSource === 'inherit' ? '继承组指派' : ($assigneeSource === 'self' ? '单独指派' : '公共任务'),
        'completionMode' => isset($r['completion_mode']) && $r['completion_mode'] === 'confirm' ? 'confirm' : 'upload',
        'completionLabel' => isset($r['completion_mode']) && $r['completion_mode'] === 'confirm' ? '仅需确认' : '附件上传',
        'completionScope' => isset($r['completion_scope']) && $r['completion_scope'] === 'all' ? 'all' : 'any',
        'completionScopeLabel' => isset($r['completion_scope']) && $r['completion_scope'] === 'all' ? '全员提交' : '任意一人提交',
        'status' => $r['status'],
        'statusLabel' => task_status_label($r['status']),
        'submitterId' => $r['submitter_id'] ? $r['submitter_id'] : '',
        'submitterName' => $r['submitter_name'],
        'submittedAt' => iso($r['submitted_at']),
        'images' => array_values(json_field($r['images_json'], array())),
        'sampleImages' => task_row_sample_images($r, 'sample_images_json'),
        'effectiveSampleImages' => task_effective_sample_images($r),
        'reviewedBy' => $r['reviewed_by'],
        'reviewedAt' => iso($r['reviewed_at']),
        'rejectReason' => $r['reject_reason'],
        'templateStatus' => isset($r['tpl_status']) ? $r['tpl_status'] : 'enabled'
    );
}

function task_instance_by_id($id)
{
    $st = db()->prepare('SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, pt.title AS group_title, sa.name AS assignee_name, sa.nickname AS assignee_nickname FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id LEFT JOIN task_templates pt ON pt.id = t.parent_id LEFT JOIN staff sa ON sa.id = i.assignee_id WHERE i.id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

/* 拍摄示例图：复用返图 key 校验，最多 3 张 */
function task_clean_sample_images($images)
{
    $out = task_clean_images($images);
    return array_slice($out, 0, 3);
}

function task_clean_images($images)
{
    $out = array();
    if (!is_array($images)) return $out;
    foreach ($images as $k) {
        if (!is_string($k)) continue;
        $k = trim($k);
        if ($k === '' || strlen($k) > 120) continue;
        if (!preg_match('/^[A-Za-z0-9_\-\/\.]+$/', $k) || strpos($k, '..') !== false) continue;
        if (!in_array($k, $out, true)) $out[] = $k;
        if (count($out) >= 9) break;
    }
    return $out;
}

/**
 * 全员提交：执行人集合。
 * 指定人任务 = 该员工；公共任务 = 全部在职员工（staff 表无门店字段，任务本身按 store_codes 限定门店）。
 */
function task_executor_ids($assigneeId)
{
    $assigneeId = (string)$assigneeId;
    if ($assigneeId !== '') return array($assigneeId);
    return db()->query("SELECT id FROM staff WHERE status = 'active' ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
}

/* 批量读取实例的个人提交记录（key=instance_id） */
function task_instance_submissions($instanceIds)
{
    $out = array();
    $ids = array();
    foreach ($instanceIds as $id) {
        $id = (int)$id;
        if ($id > 0) $ids[$id] = $id;
    }
    if (!$ids) return $out;
    $st = db()->prepare('SELECT instance_id, staff_id, status, images_json, submitted_at FROM task_submissions WHERE instance_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $st->execute(array_values($ids));
    foreach ($st->fetchAll() as $r) {
        $out[(int)$r['instance_id']][] = $r;
    }
    return $out;
}

/* 清除某模板未完成实例的个人提交（改派 / 改完成方式后避免残留） */
function task_clear_pending_submissions($templateId)
{
    $st = db()->prepare("DELETE FROM task_submissions WHERE instance_id IN (SELECT id FROM task_instances WHERE template_id = ? AND status IN ('pending','rejected','overdue'))");
    $st->execute(array($templateId));
}

/**
 * 只同步未完成实例的指派对象 / 完成方式 / 提交方式；已提交待审核与已完成期次保持不变。
 */
function task_sync_pending_instances($templateId, $assigneeId, $completionMode = null, $completionScope = null)
{
    $sets = array('assignee_id = ?');
    $args = array($assigneeId);
    if ($completionMode !== null) { $sets[] = 'completion_mode = ?'; $args[] = $completionMode; }
    if ($completionScope !== null) { $sets[] = 'completion_scope = ?'; $args[] = $completionScope; }
    $sets[] = 'updated_at = ?';
    $args[] = now_dt();
    $args[] = $templateId;
    $st = db()->prepare("UPDATE task_instances SET " . implode(', ', $sets) . " WHERE template_id = ? AND status IN ('pending','rejected','overdue')");
    $st->execute($args);
    return $st->rowCount();
}

/**
 * 校验任务指派对象：须在职，且任务适用门店必须包含当前门店（跨店任务不可指派给本店员工）。
 */
function task_validate_assignee($assigneeId, $storeCodes, $storeCode)
{
    if ($assigneeId === '') return null;
    $target = staff_by_id($assigneeId);
    if (!$target || $target['status'] !== 'active') {
        throw new ApiException('指派对象不存在或非在职员工', 'NOT_FOUND', 404);
    }
    if (!task_store_match(array('store_codes' => (string)$storeCodes), $storeCode)) {
        throw new ApiException('该任务不属于当前门店，不能指派给本店员工', 'FORBIDDEN', 403);
    }
    return $target;
}

/* ---------------- 店员端 ---------------- */

function api_task_employee_list($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $info = store_info();
    $today = today_d();
    $from = date('Y-m-d', strtotime($today . ' -30 day'));
    $to = date('Y-m-d', strtotime($today . ' +7 day'));
    task_ensure_instances($from, $to, $info['code']);

    /* 店长 / 店助可查看全店任务（含其他人的个人任务），其余员工只看公共任务与自己的个人任务 */
    $position = normalize_position($staff['position']);
    $canManage = in_array($position, array('店长', '店助'), true);
    $assigneeSql = $canManage ? '' : " AND (i.assignee_id = '' OR i.assignee_id = ?)";
    $st = db()->prepare("SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, t.sample_images_json, pt.title AS group_title, pt.content AS group_content, pt.sample_images_json AS group_sample_images, pt.assignee_id AS group_assignee_id, psa.name AS group_assignee_name, psa.nickname AS group_assignee_nickname, sa.name AS assignee_name, sa.nickname AS assignee_nickname
        FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        LEFT JOIN staff psa ON psa.id = pt.assignee_id
        LEFT JOIN staff sa ON sa.id = i.assignee_id
        WHERE t.status = 'enabled'
          AND (t.parent_id IS NULL OR pt.status = 'enabled')
          AND (t.store_codes = '' OR FIND_IN_SET(?, t.store_codes))" . $assigneeSql . "
          AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))
          AND i.published_at IS NOT NULL
          AND i.period_date >= ? AND i.period_date <= ?
        ORDER BY i.period_date DESC, i.id DESC");
    $args = array($info['code']);
    if (!$canManage) $args[] = $staff['id'];
    $args[] = $from;
    $args[] = $to;
    $st->execute($args);

    $labels = task_status_labels();
    $rows = $st->fetchAll();
    $subs = task_instance_submissions(array_map(function ($x) { return $x['id']; }, $rows));
    /* 全员模式的公共任务执行人 = 全部在职员工 */
    $executorName = array();
    foreach (db()->query("SELECT id, name, nickname FROM staff WHERE status = 'active' ORDER BY id")->fetchAll() as $s) {
        $executorName[$s['id']] = display_name($s['name'], isset($s['nickname']) ? $s['nickname'] : '');
    }
    $activeIds = array_keys($executorName);
    $counts = array();
    foreach ($labels as $k => $v) $counts[$k] = 0;
    $list = array();
    $todayPending = 0;
    $overdue = 0;
    $grouped = array();
    foreach ($rows as $r) {
        $item = task_instance_out($r);
        $scope = $item['completionScope'];
        $mySubmitted = false;
        if ($scope === 'all') {
            $executors = $item['assigneeId'] !== '' ? array($item['assigneeId']) : $activeIds;
            $done = array();
            foreach ((isset($subs[$item['id']]) ? $subs[$item['id']] : array()) as $s) {
                if ($s['status'] === 'submitted' || $s['status'] === 'approved') $done[$s['staff_id']] = true;
            }
            $doneCount = 0;
            $missing = array();
            foreach ($executors as $eid) {
                if (isset($done[$eid])) { $doneCount++; continue; }
                if (isset($executorName[$eid])) $missing[] = $executorName[$eid];
                elseif ($eid === $item['assigneeId'] && $item['assigneeDisplayName'] !== '') $missing[] = $item['assigneeDisplayName'];
            }
            $item['executorCount'] = count($executors);
            $item['submittedCount'] = $doneCount;
            $item['progressText'] = $doneCount . '/' . count($executors);
            $item['missingNames'] = $missing;
            $mySubmitted = isset($done[(string)$staff['id']]);
        }
        $item['mySubmitted'] = $mySubmitted;

        /* 提交后从员工任务列表隐藏：待审核/已通过整条隐藏；全员模式本人已提交也隐藏 */
        $hidden = in_array($item['status'], array('submitted', 'approved'), true) || ($scope === 'all' && $mySubmitted);

        /* 分组进度按全部子项汇总（含已提交/已通过的隐藏项），避免隐藏后「3/5」回退 */
        if ($item['parentId'] !== '') {
            $key = $item['parentId'] . '|' . $item['periodDate'];
            if (!isset($grouped[$key])) {
                $grouped[$key] = array(
                    'parentId' => $item['parentId'],
                    'title' => $item['groupTitle'],
                    'content' => isset($r['group_content']) ? (string)$r['group_content'] : '',
                    'cycle' => $item['cycle'],
                    'cycleLabel' => $item['cycleLabel'],
                    'periodDate' => $item['periodDate'],
                    'defaultAssigneeId' => isset($r['group_assignee_id']) ? (string)$r['group_assignee_id'] : '',
                    'defaultAssigneeDisplayName' => display_name(isset($r['group_assignee_name']) ? $r['group_assignee_name'] : '', isset($r['group_assignee_nickname']) ? $r['group_assignee_nickname'] : ''),
                    'total' => 0,
                    'approved' => 0,
                    'submitted' => 0,
                    'rejected' => 0,
                    'pending' => 0,
                    'overdue' => 0,
                    'done' => false,
                    'progressText' => '',
                    'children' => array()
                );
            }
            $grouped[$key]['total']++;
            if (isset($grouped[$key][$item['status']])) $grouped[$key][$item['status']]++;
            if (!$hidden) $grouped[$key]['children'][] = $item;
        }

        if ($hidden) continue;

        if (isset($counts[$item['status']])) $counts[$item['status']]++;
        /* 待办角标只统计本人：公共任务 + 指派给自己的个人任务；管理岗查看他人任务不计入角标 */
        $isMine = $item['assigneeId'] === '' || $item['assigneeId'] === (string)$staff['id'];
        /* 今日未完成 = 今天这一期里待完成或已驳回（待审核不算员工待办） */
        if ($isMine && $item['periodDate'] === $today && ($item['status'] === 'pending' || $item['status'] === 'rejected')) $todayPending++;
        /* 逾期 = 服务端已推进为 overdue（与执行日、客户端时钟无关） */
        if ($isMine && $item['status'] === 'overdue') $overdue++;
        $list[] = $item;
    }

    /* 只展示「今天与最近一期」；已全部通过的期次只保留最近一期，避免历史刷屏 */
    $recentFrom = date('Y-m-d', strtotime($today . ' -1 day'));
    $latestDone = array();
    $latestPeriod = array();
    foreach ($grouped as $key => $g) {
        $pid = $g['parentId'];
        if ($g['periodDate'] <= $today && (!isset($latestPeriod[$pid]) || $g['periodDate'] > $latestPeriod[$pid])) {
            $latestPeriod[$pid] = $g['periodDate'];
        }
        if ($g['total'] > 0 && $g['approved'] === $g['total']) {
            if (!isset($latestDone[$pid]) || $g['periodDate'] > $latestDone[$pid]) $latestDone[$pid] = $g['periodDate'];
        }
    }
    $groups = array();
    foreach ($grouped as $key => $g) {
        $pid = $g['parentId'];
        if ($g['periodDate'] > $today) continue;
        /* 有逾期子项的组不受「最近一期」限制，保证逾期可见 */
        if ($g['periodDate'] < $recentFrom && (int)$g['overdue'] === 0 && (!isset($latestPeriod[$pid]) || $g['periodDate'] !== $latestPeriod[$pid])) continue;
        $done = $g['total'] > 0 && $g['approved'] === $g['total'];
        if ($done && $g['periodDate'] !== $latestDone[$pid]) continue;
        $g['done'] = $done;
        /* 进度含待审核（已提交即算推进），完成判定仍要求全部子实例 approved */
        $g['progressText'] = ((int)$g['approved'] + (int)$g['submitted']) . '/' . $g['total'];
        $groups[] = $g;
    }
    usort($groups, function ($a, $b) {
        if ($a['periodDate'] !== $b['periodDate']) return $a['periodDate'] < $b['periodDate'] ? 1 : -1;
        return strcmp((string)$a['title'], (string)$b['title']);
    });

    return array(
        'list' => $list,
        'groups' => $groups,
        'counts' => $counts,
        'today' => $today,
        'todayPending' => $todayPending,
        'overdueCount' => $overdue,
        'statusLabels' => $labels,
        'cycles' => task_cycles(),
        'weekdays' => task_weekdays(),
        'staffName' => $staff['name'],
        'myStaffId' => (string)$staff['id'],
        'canManage' => $canManage,
        'position' => $position,
        'taskKinds' => task_kind_list(false),
        'isSuper' => isset($acc['role']) && $acc['role'] === 'superadmin',
        'storeCode' => $info['code']
    );
}

function task_super_staff_ids()
{
    try {
        $rows = db()->query("SELECT staff_id FROM accounts WHERE role = 'superadmin' AND status = 'active' AND staff_id IS NOT NULL AND staff_id <> ''")->fetchAll(PDO::FETCH_COLUMN);
        return array_map('strval', $rows);
    } catch (Exception $e) {
        return array();
    }
}

/* 员工提交任务后通知超管：全员模式只在最后一人提交时合并为一条 */
function notify_super_task_submitted($row, $staff, $opts = array())
{
    if (!$row || !$staff) return;
    $instanceId = (string)$row['id'];
    $submittedAt = isset($row['submitted_at']) ? (string)$row['submitted_at'] : now_dt();
    $period = isset($row['period_date']) ? (string)$row['period_date'] : '';
    $when = substr($submittedAt, 0, 16);
    $approved = isset($row['status']) && $row['status'] === 'approved';
    $merged = !empty($opts['merged']);
    $title = $approved ? '任务完成提醒（无需审核）' : '任务提交通知';
    if ($approved) {
        $body = $merged
            ? '「' . $row['title'] . '」' . $period . ' 全员已完成（确认人：' . $staff['name'] . '，' . $when . '），无需审核。'
            : ($staff['name'] . ' 已确认完成「' . $row['title'] . '」（' . $period . '，' . $when . '），无需审核。');
    } else {
        $body = $merged
            ? '「' . $row['title'] . '」' . $period . ' 全员已提交：共 ' . (int)(isset($opts['executorCount']) ? $opts['executorCount'] : 0) .
                ' 人，最后提交人 ' . $staff['name'] . '，返图 ' . (int)(isset($opts['imageCount']) ? $opts['imageCount'] : 0) . ' 张，待审核。'
            : ($staff['name'] . ' 于 ' . $when . ' 提交了「' . $row['title'] . '」（' . $period . '），返图 ' .
                (int)(isset($opts['imageCount']) ? $opts['imageCount'] : 0) . ' 张，待审核。');
    }
    $link = 'admin-tasks.html?task=' . rawurlencode($instanceId) . '&status=all';
    $dedupe = 'task.notify|' . $instanceId . '|' . (isset($row['status']) ? $row['status'] : '');
    foreach (task_super_staff_ids() as $sid) {
        if ($sid === (string)$staff['id']) continue;
        $st = db()->prepare("SELECT 1 FROM messages WHERE staff_id = ? AND type = 'task' AND ref_id = ? AND created_at >= ? LIMIT 1");
        $st->execute(array($sid, $instanceId, $submittedAt));
        if ($st->fetchColumn()) continue;
        push_message($sid, 'task', $title, $body, $link, $instanceId, $dedupe);
    }
}

function api_task_employee_submit($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $id = (int)in_str($in, 'id', 20);
    $row = task_instance_by_id($id);
    if (!$row) throw new ApiException('任务不存在', 'NOT_FOUND', 404);

    $info = store_info();
    if (!task_store_match($row, $info['code'])) throw new ApiException('该任务不属于本门店', 'FORBIDDEN', 403);
    if ($row['tpl_status'] !== 'enabled') throw new ApiException('该任务已停用，无法提交');
    if (task_children($row['template_id'])) throw new ApiException('母任务无需提交，请完成其下的子任务');

    if ($row['status'] === 'approved') throw new ApiException('该期任务已审核通过，无需重复提交');
    if ($row['status'] === 'submitted') {
        throw new ApiException('该任务已提交，待审核');
    }
    if (empty($row['published_at'])) throw new ApiException('任务尚未到发布时间，暂不能提交');

    $assignee = isset($row['assignee_id']) ? (string)$row['assignee_id'] : '';
    if ($assignee !== '' && $assignee !== (string)$staff['id']) {
        throw new ApiException('该任务已指派给其他同事，无法提交', 'FORBIDDEN', 403);
    }
    $mode = isset($row['completion_mode']) && $row['completion_mode'] === 'confirm' ? 'confirm' : 'upload';
    $scope = isset($row['completion_scope']) && $row['completion_scope'] === 'all' ? 'all' : 'any';

    /* 全员提交：每人各自提交，全部到齐后实例才完成 */
    if ($scope === 'all') {
        $chk = db()->prepare('SELECT id FROM task_submissions WHERE instance_id = ? AND staff_id = ?');
        $chk->execute(array($id, $staff['id']));
        if ($chk->fetchColumn()) throw new ApiException('你已提交，等待其他同事完成');

        $images = array();
        $subStatus = 'approved';
        if ($mode === 'upload') {
            $images = task_clean_images(isset($in['images']) ? $in['images'] : array());
            if (!$images) throw new ApiException('请至少上传 1 张返图');
            $subStatus = 'submitted';
        }
        $ins = db()->prepare('INSERT INTO task_submissions (instance_id, staff_id, status, images_json, submitted_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE status = VALUES(status), images_json = VALUES(images_json), submitted_at = VALUES(submitted_at), reviewed_at = NULL');
        $ins->execute(array($id, $staff['id'], $subStatus, json_encode($images, JSON_UNESCAPED_UNICODE), now_dt()));

        $executors = task_executor_ids($assignee);
        $doneIds = array();
        $st = db()->prepare("SELECT staff_id FROM task_submissions WHERE instance_id = ? AND status IN ('submitted','approved')");
        $st->execute(array($id));
        foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $sid) $doneIds[(string)$sid] = true;
        $doneCount = 0;
        foreach ($executors as $eid) {
            if (isset($doneIds[(string)$eid])) $doneCount++;
        }

        /* 未齐员：实例保持待完成 / 逾期，仅记录本次提交（本人任务列表随之隐藏） */
        if ($doneCount < count($executors)) {
            $st = db()->prepare('UPDATE task_instances SET updated_at = ? WHERE id = ?');
            $st->execute(array(now_dt(), $id));
            audit_log($mode === 'confirm' ? '确认完成任务' : '提交任务返图', $row['title'], $row['period_date'] . ' · 全员 ' . $doneCount . '/' . count($executors));
            $fresh = task_instance_by_id($id);
            return task_instance_out($fresh);
        }

        if ($mode === 'confirm') {
            $st = db()->prepare("UPDATE task_instances SET status = 'approved', submitter_id = ?, submitter_name = '全员提交', submitted_at = ?, images_json = '[]', reviewed_by = '系统确认', reviewer_id = NULL, reviewed_at = ?, reject_reason = '', updated_at = ? WHERE id = ? AND status IN ('pending','rejected','overdue')");
            $st->execute(array($staff['id'], now_dt(), now_dt(), now_dt(), $id));
            if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
            $up = db()->prepare("UPDATE task_submissions SET status = 'approved', reviewed_at = ? WHERE instance_id = ?");
            $up->execute(array(now_dt(), $id));
        } else {
            /* 合并全员返图，供管理员一次审核 */
            $merged = array();
            $st = db()->prepare('SELECT images_json FROM task_submissions WHERE instance_id = ? ORDER BY submitted_at ASC, id ASC');
            $st->execute(array($id));
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $raw) {
                foreach (json_field($raw, array()) as $k) {
                    if (!in_array($k, $merged, true)) $merged[] = $k;
                }
            }
            $st = db()->prepare("UPDATE task_instances SET status = 'submitted', submitter_id = ?, submitter_name = '全员提交', submitted_at = ?, images_json = ?, reviewed_by = '', reviewer_id = NULL, reviewed_at = NULL, reject_reason = '', updated_at = ? WHERE id = ? AND status IN ('pending','rejected','overdue')");
            $st->execute(array($staff['id'], now_dt(), json_encode($merged, JSON_UNESCAPED_UNICODE), now_dt(), $id));
            if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
        }
        if (function_exists('feishu_cancel_task_pending')) feishu_cancel_task_pending($id);
        audit_log('全员提交完成任务', $row['title'], $row['period_date'] . ' · 全体 ' . count($executors) . ' 人已提交');
        $fresh = task_instance_by_id($id);
        notify_super_task_submitted($fresh, $staff, array(
            'merged' => true,
            'executorCount' => count($executors),
            'imageCount' => $mode === 'confirm' ? 0 : count($merged)
        ));
        return task_instance_out($fresh);
    }

    /* 仅需确认：点击完成即视为通过，无需附件 */
    if ($mode === 'confirm') {
        $st = db()->prepare("UPDATE task_instances SET status = 'approved', submitter_id = ?, submitter_name = ?, submitted_at = ?, images_json = '[]', reviewed_by = '系统确认', reviewer_id = NULL, reviewed_at = ?, reject_reason = '', updated_at = ? WHERE id = ? AND status IN ('pending','rejected','overdue')");
        $st->execute(array($staff['id'], $staff['name'], now_dt(), now_dt(), now_dt(), $id));
        if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
        if (function_exists('feishu_cancel_task_pending')) feishu_cancel_task_pending($id);
        audit_log('确认完成任务', $row['title'], $row['period_date'] . ' · 仅需确认');
        $row = task_instance_by_id($id);
        notify_super_task_submitted($row, $staff, array('merged' => false, 'imageCount' => 0));
        return task_instance_out($row);
    }

    $images = task_clean_images(isset($in['images']) ? $in['images'] : array());
    if (!$images) throw new ApiException('请至少上传 1 张返图');

    $st = db()->prepare('UPDATE task_instances SET status = ?, submitter_id = ?, submitter_name = ?, submitted_at = ?, images_json = ?, reviewed_by = \'\', reviewer_id = NULL, reviewed_at = NULL, reject_reason = \'\', updated_at = ? WHERE id = ? AND status IN (\'pending\',\'rejected\',\'overdue\')');
    $st->execute(array('submitted', $staff['id'], $staff['name'], now_dt(), json_encode($images, JSON_UNESCAPED_UNICODE), now_dt(), $id));
    if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');

    if (function_exists('feishu_cancel_task_pending')) feishu_cancel_task_pending($id);
    audit_log('提交任务返图', $row['title'], $row['period_date'] . ' · ' . count($images) . ' 张');
    $row = task_instance_by_id($id);
    notify_super_task_submitted($row, $staff, array('merged' => false, 'imageCount' => count($images)));
    return task_instance_out($row);
}

/**
 * 员工端指派 / 改派（店长 / 店助）。
 * - 传 groupId：改派分组默认指派人，只同步未单独指定（assignee_override=0）的子任务；
 * - 传 id：指派 / 改派公共任务、顶层个人任务或单个子任务；子任务改派即标记为单独指定；
 * - 仅更新 pending / rejected 实例，已提交待审核与已完成期次不受影响；
 * - 写操作日志，并给新指派人发站内消息。
 */
function api_task_reassign($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $position = normalize_position($staff['position']);
    if (!in_array($position, array('店长', '店助'), true)) {
        throw new ApiException('仅店长或店助可指派或改派任务', 'FORBIDDEN', 403);
    }

    $assigneeId = in_str($in, 'assigneeId', 16);
    if ($assigneeId === '') throw new ApiException('请选择指派对象');
    $info = store_info();
    $groupId = in_str($in, 'groupId', 24);

    /* 分组整组改派：更新母任务默认指派人 + 未单独指定的子任务 */
    if ($groupId !== '') {
        $group = task_template_row($groupId);
        if (!$group) throw new ApiException('分组任务不存在', 'NOT_FOUND', 404);
        if ((string)$group['parent_id'] !== '') throw new ApiException('请选择分组母任务', 'BAD_REQUEST', 400);
        if ($group['status'] !== 'enabled') throw new ApiException('该分组已停用，无法改派');
        if (!task_store_match($group, $info['code'])) throw new ApiException('该任务不属于本门店', 'FORBIDDEN', 403);
        $children = task_children($groupId);
        if (!$children) throw new ApiException('该任务不是分组任务');
        $target = task_validate_assignee($assigneeId, $group['store_codes'], $info['code']);
        $newName = display_name($target['name'], isset($target['nickname']) ? $target['nickname'] : '');
        $current = isset($group['assignee_id']) ? (string)$group['assignee_id'] : '';
        if ($assigneeId === $current) throw new ApiException('该组默认指派人已是' . $newName . '，无需改派');

        $st = db()->prepare('UPDATE task_templates SET assignee_id = ?, updated_at = ? WHERE id = ?');
        $st->execute(array($assigneeId, now_dt(), $groupId));
        $synced = 0;
        foreach ($children as $child) {
            if (!empty($child['assignee_override'])) continue;
            $up = db()->prepare('UPDATE task_templates SET assignee_id = ?, updated_at = ? WHERE id = ?');
            $up->execute(array($assigneeId, now_dt(), $child['id']));
            task_sync_pending_instances($child['id'], $assigneeId);
            task_clear_pending_submissions($child['id']);
            $synced++;
        }

        $oldStaff = $current !== '' ? staff_by_id($current) : null;
        $oldName = $oldStaff ? display_name($oldStaff['name'], isset($oldStaff['nickname']) ? $oldStaff['nickname'] : '') : '公共分组';
        audit_log('改派分组任务', $group['title'], $oldName . ' → ' . $newName . '；同步 ' . $synced . ' 个未单独指定子任务');
        push_message(
            $assigneeId,
            'task',
            '收到改派的分组任务',
            $group['title'] . '（整组默认指派人），' . ($oldStaff ? '已由 ' . $oldName . ' 改派给你' : '已由管理岗指派给你') . '；组内未单独指定的子任务由你完成。',
            'tasks.html',
            $groupId
        );
        return array('ok' => true, 'groupId' => $groupId, 'assigneeId' => $assigneeId, 'syncedChildren' => $synced);
    }

    $id = (int)in_str($in, 'id', 20);
    $row = task_instance_by_id($id);
    if (!$row) throw new ApiException('任务不存在', 'NOT_FOUND', 404);
    if (!task_store_match($row, $info['code'])) throw new ApiException('该任务不属于本门店', 'FORBIDDEN', 403);
    if ($row['tpl_status'] !== 'enabled') throw new ApiException('该任务已停用，无法改派');
    if (task_children($row['template_id'])) {
        throw new ApiException('分组母任务请使用「改派整组」');
    }
    if ($row['status'] === 'submitted') throw new ApiException('该任务已提交待审核，暂不能改派');
    if ($row['status'] === 'approved') throw new ApiException('该任务已完成，不能改派');

    $target = task_validate_assignee($assigneeId, $row['store_codes'], $info['code']);
    $newName = display_name($target['name'], isset($target['nickname']) ? $target['nickname'] : '');
    $current = isset($row['assignee_id']) ? (string)$row['assignee_id'] : '';
    if ($assigneeId === $current) throw new ApiException('该任务已指派给' . $newName . '，无需改派');
    $oldName = $current === '' ? '公共任务' : display_name(isset($row['assignee_name']) ? $row['assignee_name'] : '', isset($row['assignee_nickname']) ? $row['assignee_nickname'] : '');

    $isChild = (string)$row['parent_id'] !== '';
    if ($isChild) {
        $st = db()->prepare('UPDATE task_templates SET assignee_id = ?, assignee_override = 1, updated_at = ? WHERE id = ?');
        $st->execute(array($assigneeId, now_dt(), $row['template_id']));
        $action = '单独指定子任务';
        $msgTitle = '收到改派的子任务';
    } else {
        $st = db()->prepare('UPDATE task_templates SET assignee_id = ?, updated_at = ? WHERE id = ?');
        $st->execute(array($assigneeId, now_dt(), $row['template_id']));
        $action = $current === '' ? '指派任务' : '改派个人任务';
        $msgTitle = $current === '' ? '收到新的个人任务' : '收到改派的个人任务';
    }
    task_sync_pending_instances($row['template_id'], $assigneeId);
    task_clear_pending_submissions($row['template_id']);

    audit_log($action, $row['title'], $row['period_date'] . '：' . $oldName . ' → ' . $newName);
    push_message(
        $assigneeId,
        'task',
        $msgTitle,
        $row['title'] . '（' . task_cycle_label(array('cycle' => $row['cycle'], 'weekdays' => $row['weekdays'], 'month_day' => $row['month_day'])) . '），' . ($current === '' ? '已指派给你' : '已由 ' . $oldName . ' 改派给你') . '，请在任务页完成。',
        'tasks.html',
        $row['template_id']
    );

    $fresh = task_instance_by_id($id);
    return task_instance_out($fresh);
}

/* ---------------- 管理端 ---------------- */

function api_task_admin_templates($in)
{
    $acc = require_admin();
    $info = store_info();
    $today = today_d();
    $from = date('Y-m-d', strtotime($today . ' -30 day'));
    task_ensure_instances($from, date('Y-m-d', strtotime($today . ' +7 day')));

    $stats = array();
    $st = db()->prepare('SELECT template_id, status, COUNT(*) AS n FROM task_instances WHERE period_date >= ? AND period_date <= ? GROUP BY template_id, status');
    $st->execute(array($from, $today));
    foreach ($st->fetchAll() as $r) {
        $tid = $r['template_id'];
        if (!isset($stats[$tid])) $stats[$tid] = array('total' => 0, 'approved' => 0, 'submitted' => 0, 'rejected' => 0, 'pending' => 0, 'overdue' => 0);
        $stats[$tid]['total'] += (int)$r['n'];
        if (isset($stats[$tid][$r['status']])) $stats[$tid][$r['status']] += (int)$r['n'];
    }

    $todayRows = array();
    $st = db()->prepare("SELECT i.template_id, i.status, i.submitter_name FROM task_instances i WHERE i.period_date = ?");
    $st->execute(array($today));
    foreach ($st->fetchAll() as $r) $todayRows[$r['template_id']] = $r;

    /* 母任务的当期进度 = 子任务当日实例中已通过的条数 / 子任务当日实例总数 */
    $todayGroup = array();
    $st = db()->prepare("SELECT t.parent_id, i.status FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id WHERE i.period_date = ? AND t.parent_id IS NOT NULL");
    $st->execute(array($today));
    foreach ($st->fetchAll() as $r) {
        $pid = $r['parent_id'];
        if (!isset($todayGroup[$pid])) $todayGroup[$pid] = array('total' => 0, 'approved' => 0, 'submitted' => 0, 'rejected' => 0, 'pending' => 0, 'overdue' => 0);
        $todayGroup[$pid]['total']++;
        if (isset($todayGroup[$pid][$r['status']])) $todayGroup[$pid][$r['status']]++;
    }

    $kindId = in_str($in, 'kindId', 24);
    if ($kindId === '') $kindId = in_str($in, 'kind', 24);
    if ($kindId !== '' && !array_key_exists($kindId, task_kind_map())) $kindId = '';
    if ($kindId === '') {
        $rows = db()->query('SELECT * FROM task_templates ORDER BY created_at DESC, id DESC')->fetchAll();
    } else {
        $st = db()->prepare('SELECT * FROM task_templates WHERE kind_id = ? ORDER BY created_at DESC, id DESC');
        $st->execute(array($kindId));
        $rows = $st->fetchAll();
    }
    $childrenOf = array();
    $byId = array();
    foreach ($rows as $r) {
        $byId[$r['id']] = $r;
        $pid = isset($r['parent_id']) && $r['parent_id'] !== null ? (string)$r['parent_id'] : '';
        if ($pid !== '') $childrenOf[$pid][] = $r;
    }

    $staffNames = array();
    foreach (db()->query('SELECT id, name, nickname FROM staff')->fetchAll() as $s) {
        $staffNames[$s['id']] = display_name($s['name'], $s['nickname']);
    }

    $build = function ($r) use ($stats, $todayRows, $todayGroup, $staffNames) {
        $item = task_template_out($r);
        $item['assigneeName'] = $item['assigneeId'] !== '' && isset($staffNames[$item['assigneeId']]) ? $staffNames[$item['assigneeId']] : '';
        $s = isset($stats[$r['id']]) ? $stats[$r['id']] : array('total' => 0, 'approved' => 0, 'submitted' => 0, 'rejected' => 0, 'pending' => 0, 'overdue' => 0);
        $item['stats'] = $s;
        $item['rate'] = $s['total'] > 0 ? round($s['approved'] * 100 / $s['total'], 1) : 0;
        $item['todayStatus'] = isset($todayRows[$r['id']]) ? $todayRows[$r['id']]['status'] : '';
        $item['todaySubmitter'] = isset($todayRows[$r['id']]) ? $todayRows[$r['id']]['submitter_name'] : '';
        return $item;
    };

    $list = array();
    foreach ($rows as $r) {
        $pid = isset($r['parent_id']) && $r['parent_id'] !== null ? (string)$r['parent_id'] : '';
        if ($pid !== '') continue;
        $item = $build($r);
        $kids = isset($childrenOf[$r['id']]) ? $childrenOf[$r['id']] : array();
        $item['isGroup'] = count($kids) > 0;
        $item['childCount'] = count($kids);
        $item['children'] = array();
        foreach ($kids as $k) $item['children'][] = $build($k);
        $item['groupTitle'] = '';
        if ($item['isGroup']) {
            $g = isset($todayGroup[$r['id']]) ? $todayGroup[$r['id']] : null;
            $total = $g ? $g['total'] : 0;
            $approved = $g ? $g['approved'] : 0;
            $item['groupToday'] = array(
                'total' => $total,
                'approved' => $approved,
                'done' => $total > 0 && $approved === $total,
                'text' => $total > 0 ? ($approved . '/' . $total) : '—'
            );
        }
        $list[] = $item;
    }

    return array(
        'list' => $list,
        'today' => $today,
        'cycles' => task_cycles(),
        'weekdays' => task_weekdays(),
        'statusLabels' => task_status_labels(),
        'store' => $info,
        'kinds' => task_kind_list(true),
        'isSuper' => isset($acc['role']) && $acc['role'] === 'superadmin',
        'pendingReview' => task_pending_count()
    );
}

function task_pending_count()
{
    $st = db()->prepare("SELECT COUNT(*) FROM task_instances WHERE status = 'submitted'");
    $st->execute();
    return (int)$st->fetchColumn();
}

function api_task_admin_template_save($in)
{
    $acc = require_admin();
    $id = in_str($in, 'id', 24);
    $old = null;
    if ($id !== '') {
        $st = db()->prepare('SELECT * FROM task_templates WHERE id = ?');
        $st->execute(array($id));
        $old = $st->fetch();
        if (!$old) throw new ApiException('任务模板不存在', 'NOT_FOUND', 404);
    }

    $title = in_str($in, 'title', 120);
    $tlen = function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title);
    if ($tlen < 2) throw new ApiException('任务标题至少 2 个字');

    $content = in_str($in, 'content', 5000);
    $clen = function_exists('mb_strlen') ? mb_strlen($content, 'UTF-8') : strlen($content);
    if ($clen < 2) throw new ApiException('请填写任务具体内容');

    /* 子任务：只支持一层，循环规则 / 生效日期 / 适用门店 / 状态全部继承母任务 */
    $parentId = in_str($in, 'parentId', 24);
    $parent = null;
    if ($parentId !== '') {
        $parent = task_template_row($parentId);
        if (!$parent) throw new ApiException('母任务不存在', 'NOT_FOUND', 404);
        if ((string)$parent['parent_id'] !== '') throw new ApiException('只支持一层分组，不能挂到子任务下');
        if ($old && $old['id'] === $parentId) throw new ApiException('不能把任务挂到自己下面');
        if ($old && task_children($old['id'])) throw new ApiException('该任务已有子任务，不能再作为子任务');
    }

    $cycle = $parent ? $parent['cycle'] : in_str($in, 'cycle', 12);
    $cycles = task_cycles();
    if (!isset($cycles[$cycle])) throw new ApiException('请选择循环规则');

    $weekdayRaw = '';
    $monthDay = 0;
    if ($parent) {
        $weekdayRaw = (string)$parent['weekdays'];
        $monthDay = (int)$parent['month_day'];
    } elseif ($cycle === 'weekly') {
        $picked = array();
        if (isset($in['weekdays']) && is_array($in['weekdays'])) {
            foreach ($in['weekdays'] as $v) $picked[] = (int)$v;
        } else {
            $picked = task_weekday_list(isset($in['weekdays']) ? $in['weekdays'] : '');
        }
        $picked = task_weekday_list(implode(',', $picked));
        if (!$picked) throw new ApiException('周循环请至少选择一个星期');
        $weekdayRaw = implode(',', $picked);
    } elseif ($cycle === 'monthly') {
        $monthDay = (int)in_str($in, 'monthDay', 4);
        if ($monthDay < 1 || $monthDay > 31) throw new ApiException('月循环请选择每月几号（1—31）');
    }

    if ($parent) {
        $startDate = (string)$parent['start_date'];
        $endDate = $parent['end_date'] ? (string)$parent['end_date'] : '';
        $storeCodes = (string)$parent['store_codes'];
        $status = $parent['status'];
    } else {
        $startDate = in_str($in, 'startDate', 10);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) throw new ApiException('请选择生效开始日期');
        $endDate = in_str($in, 'endDate', 10);
        if ($endDate !== '') {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) throw new ApiException('生效结束日期格式不正确');
            if ($endDate < $startDate) throw new ApiException('生效结束日期不能早于开始日期');
        }

        $storeCodes = in_str($in, 'storeCodes', 255);
        if ($storeCodes !== '' && !preg_match('/^[A-Za-z0-9\-]+(,[A-Za-z0-9\-]+)*$/', $storeCodes)) {
            throw new ApiException('适用门店格式不正确');
        }

        $status = in_str($in, 'status', 12, 'enabled');
        if (!in_array($status, array('enabled', 'disabled'), true)) throw new ApiException('任务状态不正确');
    }

    $parentCol = $parent ? $parent['id'] : null;

    $completionMode = in_str($in, 'completionMode', 12, 'upload');
    if (!in_array($completionMode, array('upload', 'confirm'), true)) throw new ApiException('任务完成方式不正确');
    /* 提交方式：任意一人提交（默认）/ 全员提交；子任务强制继承母任务，避免同组两种口径 */
    $completionScope = in_str($in, 'completionScope', 12, 'any');
    if (!in_array($completionScope, array('any', 'all'), true)) throw new ApiException('任务提交方式不正确');
    if ($parent) {
        $completionScope = isset($parent['completion_scope']) && $parent['completion_scope'] === 'all' ? 'all' : 'any';
    }

    /* 拍摄示例图：仅作参考展示，最多 3 张；空数组写入 NULL */
    $sampleImages = task_clean_sample_images(isset($in['sampleImages']) ? $in['sampleImages'] : array());
    $sampleImagesJson = $sampleImages ? json_encode($sampleImages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
    /* 类型：由超管维护的字典；子任务跟随母任务，避免整组被拆到不同分类 */
    $kindId = in_str($in, 'kindId', 24);
    if ($kindId === '') $kindId = in_str($in, 'kind', 24, 'sys');
    if ($parentCol !== null) {
        $prow = task_template_row($parentCol);
        if ($prow && isset($prow['kind_id']) && $prow['kind_id'] !== '') $kindId = (string)$prow['kind_id'];
    }
    $st = db()->prepare('SELECT * FROM task_kinds WHERE id = ?');
    $st->execute(array($kindId));
    $krow = $st->fetch();
    if (!$krow) throw new ApiException('任务类型不存在或已被删除');
    $prevKindId = $old && isset($old['kind_id']) ? (string)$old['kind_id'] : '';
    if (empty($krow['enabled']) && $kindId !== $prevKindId) {
        throw new ApiException('该任务类型已停用，请选择其他类型');
    }

    /* 发布 / 截止时间：子任务继承母任务；同一天内截止必须晚于发布 */
    if ($parent) {
        $publishTime = task_normalize_time(isset($parent['publish_time']) ? $parent['publish_time'] : '', '00:00:00');
        $deadlineTime = task_normalize_time(isset($parent['deadline_time']) ? $parent['deadline_time'] : '', '23:59:59');
    } else {
        $publishRaw = in_str($in, 'publishTime', 8, '00:00');
        $deadlineRaw = in_str($in, 'deadlineTime', 8, '23:59');
        if (!task_is_time($publishRaw)) throw new ApiException('发布时间格式不正确，请使用 HH:MM');
        if (!task_is_time($deadlineRaw)) throw new ApiException('截止时间格式不正确，请使用 HH:MM');
        $publishTime = task_normalize_time($publishRaw, '00:00:00');
        $deadlineTime = task_normalize_time($deadlineRaw, '23:59:59');
        if ($deadlineTime <= $publishTime) throw new ApiException('截止时间必须晚于发布时间（同一天内）');
    }

    /*
     * 指派规则：
     * - 顶层任务 / 母任务：assignee_id 为自身或整组默认指派人；
     * - 子任务：assigneeMode=inherit 时继承母任务（assignee_override=0），
     *   assigneeMode=self 时单独指定（assignee_override=1），改母任务不再覆盖该子任务。
     */
    $assigneeMode = $parent ? in_str($in, 'assigneeMode', 12, 'inherit') : 'self';
    if (!in_array($assigneeMode, array('inherit', 'self'), true)) {
        $assigneeMode = $parent ? 'inherit' : 'self';
    }
    $assigneeId = '';
    $assigneeOverride = 0;
    $explicitAssign = true;
    if ($parent) {
        if ($assigneeMode === 'inherit') {
            $assigneeId = isset($parent['assignee_id']) ? (string)$parent['assignee_id'] : '';
            $explicitAssign = false;
        } else {
            $assigneeId = in_str($in, 'assigneeId', 16);
            if ($assigneeId === '') throw new ApiException('请选择指派对象，或改为继承母任务');
            $assigneeOverride = 1;
        }
    } else {
        $assigneeId = in_str($in, 'assigneeId', 16);
    }

    $oldAssignee = $old && isset($old['assignee_id']) ? (string)$old['assignee_id'] : '';
    $assignChanged = $assigneeId !== $oldAssignee;
    $oldScope = $old && isset($old['completion_scope']) && $old['completion_scope'] === 'all' ? 'all' : 'any';
    $oldMode = $old && isset($old['completion_mode']) && $old['completion_mode'] === 'confirm' ? 'confirm' : 'upload';
    $scopeChanged = $old && $oldScope !== $completionScope;
    $modeChanged = $old && $oldMode !== $completionMode;
    $oldOverride = $old && !empty($old['assignee_override']);
    $overrideChanged = $parent && $oldOverride !== (bool)$assigneeOverride;

    if ($assigneeId !== '' && $explicitAssign && $assignChanged) {
        $storeInfo = store_info();
        task_validate_assignee($assigneeId, $storeCodes, $storeInfo['code']);
        $me = staff_by_id($acc['staff_id']);
        $myPos = $me ? normalize_position($me['position']) : '';
        if (!in_array($myPos, array('店长', '店助'), true)) {
            throw new ApiException('仅店长或店助可指派任务', 'FORBIDDEN', 403);
        }
    }

    $cycleLabel = task_cycle_label(array('cycle' => $cycle, 'weekdays' => $weekdayRaw, 'month_day' => $monthDay));
    $oldTarget = $oldAssignee !== '' ? staff_by_id($oldAssignee) : null;
    $oldName = $oldTarget ? display_name($oldTarget['name'], isset($oldTarget['nickname']) ? $oldTarget['nickname'] : '') : '未指定';
    $newTarget = $assigneeId !== '' ? staff_by_id($assigneeId) : null;
    $newName = $newTarget ? display_name($newTarget['name'], isset($newTarget['nickname']) ? $newTarget['nickname'] : '') : '公共任务';
    $kids = array();

    if ($old) {
        $st = db()->prepare('UPDATE task_templates SET title = ?, content = ?, parent_id = ?, assignee_id = ?, assignee_override = ?, completion_mode = ?, completion_scope = ?, publish_time = ?, deadline_time = ?, cycle = ?, kind_id = ?, weekdays = ?, month_day = ?, start_date = ?, end_date = ?, store_codes = ?, sample_images_json = ?, status = ?, updated_at = ? WHERE id = ?');
        $st->execute(array($title, $content, $parentCol, $assigneeId, $assigneeOverride, $completionMode, $completionScope, $publishTime, $deadlineTime, $cycle, $kindId, $weekdayRaw, $monthDay, $startDate, $endDate !== '' ? $endDate : null, $storeCodes, $sampleImagesJson, $status, now_dt(), $old['id']));
        /* 母任务的循环规则 / 生效范围 / 状态变更时同步到子任务，保证同组周期一致 */
        if (!$parent) {
            $kids = task_children($old['id']);
            if ($kids) {
                $up = db()->prepare('UPDATE task_templates SET completion_scope = ?, publish_time = ?, deadline_time = ?, cycle = ?, kind_id = ?, weekdays = ?, month_day = ?, start_date = ?, end_date = ?, store_codes = ?, status = ?, updated_at = ? WHERE parent_id = ?');
                $up->execute(array($completionScope, $publishTime, $deadlineTime, $cycle, $kindId, $weekdayRaw, $monthDay, $startDate, $endDate !== '' ? $endDate : null, $storeCodes, $status, now_dt(), $old['id']));
                /* 只同步未单独指定的子任务；单独指定的子任务保留自己的指派人 */
                if ($assignChanged) {
                    $inheritSynced = 0;
                    $upChild = db()->prepare('UPDATE task_templates SET assignee_id = ?, updated_at = ? WHERE id = ? AND assignee_override = 0');
                    foreach ($kids as $kid) {
                        if (!empty($kid['assignee_override'])) continue;
                        $upChild->execute(array($assigneeId, now_dt(), $kid['id']));
                        task_sync_pending_instances($kid['id'], $assigneeId);
                        if ($completionScope === 'all') task_clear_pending_submissions($kid['id']);
                        $inheritSynced++;
                    }
                    if ($inheritSynced > 0) {
                        audit_log('同步子任务指派', $title, $inheritSynced . ' 个未单独指定子任务继承组默认指派人');
                    }
                }
            }
        }

        if ($assignChanged || $overrideChanged) {
            if (!$parent && $kids) {
                $action = '调整组默认指派人';
            } elseif ($parent) {
                $action = $assigneeOverride ? '单独指定子任务' : '恢复子任务继承指派';
            } else {
                $action = $assigneeId === '' ? '恢复公共任务' : ($oldAssignee === '' ? '指派任务' : '改派任务');
            }
            audit_log($action, $title, $oldName . ' → ' . $newName);
        }
        audit_log('编辑任务模板', $title, $cycleLabel);
        $tid = $old['id'];
    } else {
        $tid = next_task_template_id();
        $st = db()->prepare('INSERT INTO task_templates (id, title, content, parent_id, assignee_id, assignee_override, completion_mode, completion_scope, publish_time, deadline_time, cycle, kind_id, weekdays, month_day, start_date, end_date, store_codes, sample_images_json, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)');
        $st->execute(array($tid, $title, $content, $parentCol, $assigneeId, $assigneeOverride, $completionMode, $completionScope, $publishTime, $deadlineTime, $cycle, $kindId, $weekdayRaw, $monthDay, $startDate, $endDate !== '' ? $endDate : null, $storeCodes, $sampleImagesJson, $status, $acc['name'], now_dt()));
        audit_log($parent ? '新建子任务' : ($assigneeId !== '' ? '指派个人任务' : '新建任务模板'), $title, $cycleLabel . ($assigneeId !== '' ? '；指派给 ' . $newName : ''));
    }

    /* 已生成的待完成实例同步新的指派对象、完成方式与提交方式 */
    task_sync_pending_instances($tid, $assigneeId, $completionMode, $completionScope);
    /* 全员模式下改派 / 改完成方式后，清理未完成实例的旧个人提交，避免执行人集合错位 */
    if ($completionScope === 'all' && ($assignChanged || $scopeChanged || $modeChanged)) {
        task_clear_pending_submissions($tid);
        if (!$parent && $kids) {
            foreach ($kids as $kid) task_clear_pending_submissions($kid['id']);
        }
    }

    /* 发布时间 / 截止时间变更后，重算已有实例的绝对时间并按服务端时间推进状态 */
    task_sync_instance_schedule($tid, $publishTime, $deadlineTime);
    if (!$parent && $kids) {
        foreach ($kids as $kid) task_sync_instance_schedule($kid['id'], $publishTime, $deadlineTime);
    }

    if ($assigneeId !== '' && $assignChanged) {
        $msgTitle = (!$parent && $kids) ? '收到新的分组任务' : ($parent ? '收到新的子任务' : '收到新的个人任务');
        $msgBody = $title . '（' . $cycleLabel . '）' . ((!$parent && $kids) ? '，已设为整组默认指派人' : '') . '，请在任务页完成。';
        push_message($assigneeId, 'task', $msgTitle, $msgBody, 'tasks.html', $tid);
    }

    if ($status === 'enabled') task_ensure_instances();
    return array('id' => $tid);
}

function api_task_admin_template_toggle($in)
{
    require_admin();
    $id = in_str($in, 'id', 24);
    $st = db()->prepare('SELECT * FROM task_templates WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    if (!$row) throw new ApiException('任务模板不存在', 'NOT_FOUND', 404);

    $status = $row['status'] === 'enabled' ? 'disabled' : 'enabled';
    $st = db()->prepare('UPDATE task_templates SET status = ?, updated_at = ? WHERE id = ?');
    $st->execute(array($status, now_dt(), $id));
    /* 母任务启停同步到全部子任务 */
    $up = db()->prepare('UPDATE task_templates SET status = ?, updated_at = ? WHERE parent_id = ?');
    $up->execute(array($status, now_dt(), $id));
    if ($status === 'enabled') task_ensure_instances();
    audit_log($status === 'enabled' ? '启用任务模板' : '停用任务模板', $row['title'], task_cycle_label($row));
    return array('status' => $status);
}

function api_task_admin_template_delete($in)
{
    require_admin();
    $id = in_str($in, 'id', 24);
    $st = db()->prepare('SELECT * FROM task_templates WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    if (!$row) throw new ApiException('任务模板不存在', 'NOT_FOUND', 404);

    $kids = task_children($id);
    $st = db()->prepare('DELETE FROM task_templates WHERE id = ?');
    $st->execute(array($id));
    audit_log('删除任务模板', $row['title'], $kids ? '同时删除 ' . count($kids) . ' 个子任务及其全部任务实例' : '同时删除该模板的全部任务实例');
    return array('ok' => true);
}

function api_task_admin_instances($in)
{
    require_admin();
    $date = in_str($in, 'date', 10);
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('日期格式不正确');
    $status = in_str($in, 'status', 12, 'all');
    $keyword = in_str($in, 'keyword', 60);

    $today = today_d();
    task_ensure_instances(date('Y-m-d', strtotime($today . ' -30 day')), date('Y-m-d', strtotime($today . ' +7 day')));

    $sql = "SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, pt.title AS group_title, sa.name AS assignee_name, sa.nickname AS assignee_nickname
        FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        LEFT JOIN staff sa ON sa.id = i.assignee_id
        WHERE 1=1 AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))";
    $params = array();
    if ($date !== '') {
        $sql .= ' AND i.period_date = ?';
        $params[] = $date;
    }
    if ($status !== 'all') {
        if (!in_array($status, array('pending', 'submitted', 'approved', 'rejected', 'overdue'), true)) throw new ApiException('任务状态不正确');
        $sql .= ' AND i.status = ?';
        $params[] = $status;
    }
    if ($keyword !== '') {
        $sql .= ' AND t.title LIKE ?';
        $params[] = '%' . $keyword . '%';
    }
    $sql .= ' ORDER BY i.period_date DESC, i.submitted_at DESC, i.id DESC';
    $st = db()->prepare($sql);
    $st->execute($params);
    $list = array();
    $counts = array('pending' => 0, 'submitted' => 0, 'approved' => 0, 'rejected' => 0, 'overdue' => 0);
    foreach ($st->fetchAll() as $r) {
        $item = task_instance_out($r);
        if (isset($counts[$item['status']])) $counts[$item['status']]++;
        $list[] = $item;
    }

    return array(
        'list' => $list,
        'counts' => $counts,
        'today' => $today,
        'date' => $date,
        'status' => $status,
        'statusLabels' => task_status_labels(),
        'pendingReview' => task_pending_count()
    );
}

/* 员工端「任务审批」：仅超管，按提交时间倒序分批拉取待审核实例 */
function api_task_admin_approvals($in)
{
    require_super();
    $page = max(1, in_int($in, 'page', 1));
    $size = in_int($in, 'pageSize', 10);
    if ($size < 1) $size = 10;
    if ($size > 50) $size = 50;

    $today = today_d();
    task_ensure_instances(date('Y-m-d', strtotime($today . ' -30 day')), date('Y-m-d', strtotime($today . ' +7 day')));

    $from = " FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        LEFT JOIN staff sa ON sa.id = i.assignee_id
        WHERE i.status = 'submitted'";
    $total = (int)db()->query('SELECT COUNT(*)' . $from)->fetchColumn();
    $totalPages = max(1, (int)ceil($total / $size));
    if ($page > $totalPages) $page = $totalPages;

    $sql = 'SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, pt.title AS group_title, sa.name AS assignee_name, sa.nickname AS assignee_nickname'
        . $from . ' ORDER BY i.submitted_at DESC, i.id DESC LIMIT ' . $size . ' OFFSET ' . (($page - 1) * $size);
    $list = array();
    foreach (db()->query($sql) as $r) $list[] = task_instance_out($r);

    return array(
        'list' => $list,
        'total' => $total,
        'page' => $page,
        'pageSize' => $size,
        'totalPages' => $totalPages
    );
}

function api_task_admin_review($in)
{
    $acc = require_admin();
    return task_review_apply($acc, $in);
}

/* 审批弹层专用：只允许超管，状态流转与后台审核共用同一份逻辑 */
function api_task_admin_approval_review($in)
{
    $acc = require_super();
    return task_review_apply($acc, $in);
}

function task_review_apply($acc, $in)
{
    $id = (int)in_str($in, 'id', 20);
    $row = task_instance_by_id($id);
    if (!$row) throw new ApiException('任务不存在', 'NOT_FOUND', 404);
    if ($row['status'] !== 'submitted') throw new ApiException('该任务当前不是待审核状态，请刷新后重试');

    $action = in_str($in, 'action', 10);
    if ($action === 'approve') {
        $st = db()->prepare("UPDATE task_instances SET status = 'approved', reviewed_by = ?, reviewer_id = ?, reviewed_at = ?, reject_reason = '', updated_at = ? WHERE id = ? AND status = 'submitted'");
        $st->execute(array($acc['name'], $acc['staff_id'], now_dt(), now_dt(), $id));
        if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
        if (isset($row['completion_scope']) && $row['completion_scope'] === 'all') {
            $up = db()->prepare("UPDATE task_submissions SET status = 'approved', reviewed_at = ? WHERE instance_id = ?");
            $up->execute(array(now_dt(), $id));
        }
        if (function_exists('feishu_cancel_task_pending')) feishu_cancel_task_pending($id);
        audit_log('审核通过任务', $row['title'], $row['period_date']);
        return array('status' => 'approved');
    }

    if ($action === 'reject') {
        $reason = in_str($in, 'reason', 255);
        $rlen = function_exists('mb_strlen') ? mb_strlen($reason, 'UTF-8') : strlen($reason);
        if ($rlen < 2) throw new ApiException('驳回请填写原因（至少 2 个字）');
        $target = (!empty($row['deadline_at']) && $row['deadline_at'] < now_dt()) ? 'overdue' : 'rejected';
        $st = db()->prepare("UPDATE task_instances SET status = ?, reviewed_by = ?, reviewer_id = ?, reviewed_at = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND status = 'submitted'");
        $st->execute(array($target, $acc['name'], $acc['staff_id'], now_dt(), $reason, now_dt(), $id));
        if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
        /* 全员模式驳回：清空个人提交，全员重新提交 */
        if (isset($row['completion_scope']) && $row['completion_scope'] === 'all') {
            $del = db()->prepare('DELETE FROM task_submissions WHERE instance_id = ?');
            $del->execute(array($id));
        }
        audit_log('驳回任务', $row['title'], $row['period_date'] . ' · ' . $reason . ($target === 'overdue' ? '（已过截止时间，转逾期）' : ''));
        return array('status' => $target);
    }

    throw new ApiException('审核动作不正确');
}

function api_task_admin_detail($in)
{
    require_admin();
    $id = (int)in_str($in, 'id', 20);
    $row = task_instance_by_id($id);
    if (!$row) throw new ApiException('任务不存在', 'NOT_FOUND', 404);

    $today = today_d();
    task_ensure_instances(date('Y-m-d', strtotime($today . ' -30 day')), date('Y-m-d', strtotime($today . ' +7 day')));

    $st = db()->prepare("SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, pt.title AS group_title
        FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        WHERE i.template_id = ? AND i.period_date <= ? ORDER BY i.period_date DESC LIMIT 12");
    $st->execute(array($row['template_id'], $today));
    $history = array();
    foreach ($st->fetchAll() as $h) $history[] = task_instance_out($h);

    $st = db()->prepare('SELECT status, COUNT(*) AS n FROM task_instances WHERE template_id = ? AND period_date <= ? GROUP BY status');
    $st->execute(array($row['template_id'], $today));
    $stats = array('total' => 0, 'approved' => 0, 'submitted' => 0, 'rejected' => 0, 'pending' => 0, 'overdue' => 0);
    foreach ($st->fetchAll() as $s) {
        $stats['total'] += (int)$s['n'];
        if (isset($stats[$s['status']])) $stats[$s['status']] += (int)$s['n'];
    }
    $stats['rate'] = $stats['total'] > 0 ? round($stats['approved'] * 100 / $stats['total'], 1) : 0;

    return array(
        'instance' => task_instance_out($row),
        'history' => $history,
        'stats' => $stats,
        'statusLabels' => task_status_labels()
    );
}

/* 员工端「已完成」独立页：按日期查看已通过 / 待审核 */
function api_task_completed($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $date = in_str($in, 'date', 10);
    if ($date === '') $date = today_d();
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('日期格式不正确');

    $info = store_info();
    task_ensure_instances($date, $date, $info['code']);

    $position = normalize_position($staff['position']);
    $canManage = in_array($position, array('店长', '店助'), true);
    $assigneeSql = $canManage ? '' : " AND (i.assignee_id = '' OR i.assignee_id = ?)";
    $st = db()->prepare("SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, t.sample_images_json, pt.title AS group_title, pt.sample_images_json AS group_sample_images, sa.name AS assignee_name, sa.nickname AS assignee_nickname
        FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        LEFT JOIN staff sa ON sa.id = i.assignee_id
        WHERE t.status = 'enabled'
          AND (t.parent_id IS NULL OR pt.status = 'enabled')
          AND (t.store_codes = '' OR FIND_IN_SET(?, t.store_codes))" . $assigneeSql . "
          AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))
          AND i.published_at IS NOT NULL
          AND i.period_date = ?
          AND i.status IN ('submitted','approved')
        ORDER BY i.status ASC, i.reviewed_at DESC, i.submitted_at DESC, i.id DESC");
    $args = array($info['code']);
    if (!$canManage) $args[] = $staff['id'];
    $args[] = $date;
    $st->execute($args);

    $list = array();
    $counts = array('submitted' => 0, 'approved' => 0);
    foreach ($st->fetchAll() as $r) {
        $item = task_instance_out($r);
        if (isset($counts[$item['status']])) $counts[$item['status']]++;
        $list[] = $item;
    }

    return array(
        'list' => $list,
        'counts' => $counts,
        'date' => $date,
        'today' => today_d(),
        'statusLabels' => task_status_labels(),
        'canManage' => $canManage,
        'myStaffId' => (string)$staff['id']
    );
}

/* 逾期任务独立页：与「已完成」页同构，默认本人可见的逾期任务（公共 + 指派给自己） */
function api_task_overdue($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);

    $today = today_d();
    /* 与任务列表 / 底部红点同窗口（近 30 天），保证红点出现即有逾期可处理 */
    $from = date('Y-m-d', strtotime($today . ' -30 day'));
    $info = store_info();
    task_ensure_instances($from, $today, $info['code']);

    $date = in_str($in, 'date', 10);
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('日期格式不正确');
    $cycle = in_str($in, 'cycle', 12);
    if ($cycle !== '' && !array_key_exists($cycle, task_cycles())) $cycle = '';
    /* mine=1：只取指派给当前登录员工的逾期（用于「个人任务」分类） */
    $mine = !empty($in['mine']);
    /* kind=类型 ID：按任务类型字典过滤逾期（供任务页类型下拉使用） */
    $kind = in_str($in, 'kind', 24);
    if ($kind !== '' && !array_key_exists($kind, task_kind_map())) $kind = '';

    $sql = "SELECT i.*, t.title, t.content, t.cycle, t.kind_id, t.weekdays, t.month_day, t.store_codes, t.parent_id, t.assignee_override, t.status AS tpl_status, t.sample_images_json, pt.title AS group_title, pt.sample_images_json AS group_sample_images, sa.name AS assignee_name, sa.nickname AS assignee_nickname
        FROM task_instances i INNER JOIN task_templates t ON t.id = i.template_id
        LEFT JOIN task_templates pt ON pt.id = t.parent_id
        LEFT JOIN staff sa ON sa.id = i.assignee_id
        WHERE t.status = 'enabled'
          AND (t.parent_id IS NULL OR pt.status = 'enabled')
          AND (t.store_codes = '' OR FIND_IN_SET(?, t.store_codes))
          AND (t.parent_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM task_templates c WHERE c.parent_id = t.id))
          AND i.published_at IS NOT NULL
          AND i.status = 'overdue'
          AND (i.assignee_id = '' OR i.assignee_id = ?)
          AND i.period_date >= ? AND i.period_date <= ?";
    $args = array($info['code'], $staff['id'], $from, $today);
    if ($mine) {
        $sql .= ' AND i.assignee_id = ?';
        $args[] = $staff['id'];
    }
    if ($date !== '') {
        $sql .= ' AND i.period_date = ?';
        $args[] = $date;
    }
    if ($cycle !== '') {
        $sql .= ' AND t.cycle = ?';
        $args[] = $cycle;
    }
    if ($kind !== '') {
        $sql .= ' AND t.kind_id = ?';
        $args[] = $kind;
    }
    $sql .= ' ORDER BY i.period_date DESC, i.deadline_at ASC, i.id DESC LIMIT 300';
    $st = db()->prepare($sql);
    $st->execute($args);

    $list = array();
    $counts = array('all' => 0);
    foreach (task_cycles() as $k => $v) $counts[$k] = 0;
    /* 全员模式：本人已提交的逾期任务不再展示（与任务列表隐藏口径一致） */
    $mySubs = array();
    $ms = db()->prepare('SELECT s.instance_id FROM task_submissions s INNER JOIN task_instances i2 ON i2.id = s.instance_id WHERE s.staff_id = ? AND i2.period_date >= ? AND i2.period_date <= ?');
    $ms->execute(array($staff['id'], $from, $today));
    foreach ($ms->fetchAll(PDO::FETCH_COLUMN) as $iid) $mySubs[(int)$iid] = true;
    foreach ($st->fetchAll() as $r) {
        $item = task_instance_out($r);
        if ($item['completionScope'] === 'all' && isset($mySubs[(int)$item['id']])) continue;
        $list[] = $item;
        $counts['all']++;
        if (isset($counts[$item['cycle']])) $counts[$item['cycle']]++;
    }

    return array(
        'list' => $list,
        'counts' => $counts,
        'date' => $date,
        'cycle' => $cycle,
        'mine' => $mine,
        'kind' => $kind,
        'kindName' => $kind !== '' ? task_kind_name($kind) : '',
        'today' => $today,
        'statusLabels' => task_status_labels(),
        'cycles' => task_cycles(),
        'myStaffId' => (string)$staff['id'],
        'canManage' => false
    );
}

/* ---------------- 任务类型字典（超管） ---------------- */

function api_task_kinds($in)
{
    $acc = require_login();
    return array(
        'list' => task_kind_list(true),
        'isSuper' => isset($acc['role']) && $acc['role'] === 'superadmin'
    );
}

function api_task_kind_save($in)
{
    $acc = require_super();
    $id = in_str($in, 'id', 24);
    $name = trim(in_str($in, 'name', 60));
    $len = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
    if ($len < 2 || $len > 20) throw new ApiException('类型名称需 2–20 个字');

    $old = null;
    if ($id !== '') {
        $st = db()->prepare('SELECT * FROM task_kinds WHERE id = ?');
        $st->execute(array($id));
        $old = $st->fetch();
        if (!$old) throw new ApiException('类型不存在或已被删除', 'NOT_FOUND', 404);
    }
    $st = db()->prepare('SELECT id, name FROM task_kinds WHERE id <> ?');
    $st->execute(array($id));
    foreach ($st->fetchAll() as $r) {
        if (strtolower(trim($r['name'])) === strtolower($name)) {
            throw new ApiException('已存在同名类型「' . $r['name'] . '」');
        }
    }

    $sortOrder = isset($in['sortOrder']) ? (int)$in['sortOrder'] : ($old ? (int)$old['sort_order'] : 0);
    if ($sortOrder < 0) $sortOrder = 0;
    if ($sortOrder > 999) $sortOrder = 999;
    $enabled = array_key_exists('enabled', $in) ? (!empty($in['enabled']) ? 1 : 0) : ($old ? (int)$old['enabled'] : 1);

    if ($old) {
        if (!empty($old['builtin']) && !$enabled) {
            throw new ApiException('内置类型「' . $old['name'] . '」不可停用');
        }
        $st = db()->prepare('UPDATE task_kinds SET name = ?, sort_order = ?, enabled = ?, updated_at = ? WHERE id = ?');
        $st->execute(array($name, $sortOrder, $enabled, now_dt(), $id));
        audit_log('编辑任务类型', $name, $enabled ? '启用' : '停用');
    } else {
        $id = 'TK' . date('YmdHis') . rand(10, 99);
        $st = db()->prepare('INSERT INTO task_kinds (id, name, sort_order, enabled, builtin, created_at, updated_at) VALUES (?,?,?,?,0,?,NULL)');
        $st->execute(array($id, $name, $sortOrder, $enabled, now_dt()));
        audit_log('新增任务类型', $name, '排序 ' . $sortOrder);
    }

    $st = db()->prepare('SELECT * FROM task_kinds WHERE id = ?');
    $st->execute(array($id));
    return task_kind_out($st->fetch(), task_kind_usage());
}

function api_task_kind_delete($in)
{
    require_super();
    $id = in_str($in, 'id', 24);
    $st = db()->prepare('SELECT * FROM task_kinds WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    if (!$row) throw new ApiException('类型不存在或已被删除', 'NOT_FOUND', 404);
    if (!empty($row['builtin'])) throw new ApiException('内置类型「' . $row['name'] . '」不可删除');
    $usage = task_kind_usage();
    $n = isset($usage[$id]) ? $usage[$id] : 0;
    if ($n > 0) throw new ApiException('该类型已被 ' . $n . ' 个任务模板引用，不能删除，请改为停用');
    $st = db()->prepare('DELETE FROM task_kinds WHERE id = ?');
    $st->execute(array($id));
    audit_log('删除任务类型', $row['name'], '未被任务模板引用');
    return array('ok' => true);
}

/* 超管在员工任务页快捷添加任务：核心字段，其余沿用后台默认 */
function api_task_quick_create($in)
{
    $acc = require_super();
    $title = trim(in_str($in, 'title', 120));
    $tlen = function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title);
    if ($tlen < 2) throw new ApiException('任务标题至少 2 个字');
    $content = trim(in_str($in, 'content', 5000));
    $clen = function_exists('mb_strlen') ? mb_strlen($content, 'UTF-8') : strlen($content);
    if ($clen < 2) throw new ApiException('请填写任务具体内容');

    $kindId = in_str($in, 'kindId', 24, 'sys');
    $st = db()->prepare('SELECT * FROM task_kinds WHERE id = ?');
    $st->execute(array($kindId));
    $krow = $st->fetch();
    if (!$krow) throw new ApiException('任务类型不存在或已被删除');
    if (empty($krow['enabled'])) throw new ApiException('该任务类型已停用，请选择其他类型');

    $cycle = in_str($in, 'cycle', 12);
    if (!array_key_exists($cycle, task_cycles())) throw new ApiException('请选择循环规则');
    $weekdayRaw = '';
    $monthDay = 0;
    if ($cycle === 'weekly') {
        $picked = array();
        if (isset($in['weekdays']) && is_array($in['weekdays'])) {
            foreach ($in['weekdays'] as $v) $picked[] = (int)$v;
        } else {
            $picked = task_weekday_list(isset($in['weekdays']) ? $in['weekdays'] : '');
        }
        $picked = task_weekday_list(implode(',', $picked));
        if (!$picked) throw new ApiException('周循环请至少选择一个星期');
        $weekdayRaw = implode(',', $picked);
    } elseif ($cycle === 'monthly') {
        $monthDay = (int)in_str($in, 'monthDay', 4);
        if ($monthDay < 1 || $monthDay > 31) throw new ApiException('月循环请选择每月几号（1—31）');
    }

    $startDate = in_str($in, 'startDate', 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) throw new ApiException('请选择生效开始日期');
    $endDate = in_str($in, 'endDate', 10);
    if ($endDate !== '') {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) throw new ApiException('生效结束日期格式不正确');
        if ($endDate < $startDate) throw new ApiException('生效结束日期不能早于开始日期');
    }

    $publishRaw = in_str($in, 'publishTime', 8, '00:00');
    $deadlineRaw = in_str($in, 'deadlineTime', 8, '23:59');
    if (!task_is_time($publishRaw)) throw new ApiException('发布时间格式不正确，请使用 HH:MM');
    if (!task_is_time($deadlineRaw)) throw new ApiException('截止时间格式不正确，请使用 HH:MM');
    $publishTime = task_normalize_time($publishRaw, '00:00:00');
    $deadlineTime = task_normalize_time($deadlineRaw, '23:59:59');
    if ($deadlineTime <= $publishTime) throw new ApiException('截止时间必须晚于发布时间（同一天内）');

    $assigneeId = in_str($in, 'assigneeId', 16);
    if ($assigneeId !== '') {
        $target = staff_by_id($assigneeId);
        if (!$target || $target['status'] !== 'active') throw new ApiException('指派对象不存在或非在职员工', 'NOT_FOUND', 404);
    }
    $completionMode = in_str($in, 'completionMode', 12, 'upload');
    if (!in_array($completionMode, array('upload', 'confirm'), true)) throw new ApiException('任务完成方式不正确');
    $sampleImages = task_clean_sample_images(isset($in['sampleImages']) ? $in['sampleImages'] : array());
    $sampleImagesJson = $sampleImages ? json_encode($sampleImages, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;

    $tid = next_task_template_id();
    $st = db()->prepare('INSERT INTO task_templates (id, title, content, parent_id, assignee_id, assignee_override, completion_mode, completion_scope, publish_time, deadline_time, cycle, kind_id, weekdays, month_day, start_date, end_date, store_codes, sample_images_json, status, created_by, created_at, updated_at) VALUES (?,?,?,NULL,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)');
    $st->execute(array(
        $tid, $title, $content, $assigneeId, $completionMode, 'any',
        $publishTime, $deadlineTime, $cycle, $kindId, $weekdayRaw, $monthDay,
        $startDate, $endDate !== '' ? $endDate : null, '', $sampleImagesJson,
        'enabled', $acc['name'], now_dt()
    ));
    audit_log('超管快捷添加任务', $title, task_cycle_label(array('cycle' => $cycle, 'weekdays' => $weekdayRaw, 'month_day' => $monthDay)) . ' · ' . task_kind_name($kindId));
    if ($assigneeId !== '') {
        $target = staff_by_id($assigneeId);
        push_message(
            $assigneeId,
            'task',
            '收到新的个人任务',
            $title . '（' . task_cycle_label(array('cycle' => $cycle, 'weekdays' => $weekdayRaw, 'month_day' => $monthDay)) . '），请在任务页完成。',
            'tasks.html',
            $tid
        );
    }
    task_ensure_instances();
    return array('id' => $tid);
}

/* 管理岗代完成：店长 / 店助对改派给他人的任务直接完成，不进审核并留痕 */
function api_task_manage_complete($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $position = normalize_position($staff['position']);
    if (!in_array($position, array('店长', '店助'), true)) {
        throw new ApiException('仅店长或店助可代完成任务', 'FORBIDDEN', 403);
    }

    $id = (int)in_str($in, 'id', 20);
    $row = task_instance_by_id($id);
    if (!$row) throw new ApiException('任务不存在', 'NOT_FOUND', 404);
    $info = store_info();
    if (!task_store_match($row, $info['code'])) throw new ApiException('该任务不属于本门店', 'FORBIDDEN', 403);
    if ($row['tpl_status'] !== 'enabled') throw new ApiException('该任务已停用，无法标记完成');
    if (task_children($row['template_id'])) throw new ApiException('母任务无需完成，请完成其下的子任务');
    if (!in_array($row['status'], array('pending', 'rejected', 'overdue'), true)) {
        throw new ApiException('该任务当前状态不可标记完成');
    }
    $assigneeId = isset($row['assignee_id']) ? (string)$row['assignee_id'] : '';
    if ($assigneeId === '') throw new ApiException('公共任务无需代完成，请由执行人提交');
    if ($assigneeId === (string)$staff['id']) throw new ApiException('该任务由你执行，请使用正常的完成操作');
    $target = staff_by_id($assigneeId);
    $targetName = $target ? display_name($target['name'], isset($target['nickname']) ? $target['nickname'] : '') : $assigneeId;

    $st = db()->prepare("UPDATE task_instances SET status = 'approved', submitter_id = ?, submitter_name = ?, submitted_at = ?, reviewed_by = ?, reviewer_id = ?, reviewed_at = ?, reject_reason = '', updated_at = ? WHERE id = ? AND status IN ('pending','rejected','overdue')");
    $st->execute(array($staff['id'], $staff['name'], now_dt(), $staff['name'], $staff['id'], now_dt(), now_dt(), $id));
    if ($st->rowCount() === 0) throw new ApiException('该任务状态已变化，请刷新后重试');
    if (isset($row['completion_scope']) && $row['completion_scope'] === 'all') {
        $up = db()->prepare("UPDATE task_submissions SET status = 'approved', reviewed_at = ? WHERE instance_id = ?");
        $up->execute(array(now_dt(), $id));
    }
    if (function_exists('feishu_cancel_task_pending')) feishu_cancel_task_pending($id);
    audit_log('管理岗代完成任务', $row['title'], $row['period_date'] . ' · 操作人 ' . $staff['name'] . ' · 原执行人 ' . $targetName);
    $fresh = task_instance_by_id($id);
    return task_instance_out($fresh);
}

/* 可选：供外部 cron 调用的补齐 / 状态推进入口（幂等） */
function api_task_cron($in)
{
    $cfg = app_config();
    $token = isset($cfg['app']['cron_token']) ? (string)$cfg['app']['cron_token'] : '';
    $given = isset($in['token']) ? (string)$in['token'] : (isset($_GET['token']) ? (string)$_GET['token'] : '');
    if ($token === '' || !hash_equals($token, $given)) {
        require_super();
    }
    $created = task_ensure_instances();
    $adv = task_advance_states();
    if (function_exists('feishu_webhook_tick')) feishu_webhook_tick();
    audit_log('任务定时推进', '任务下发', '新增 ' . $created . ' 条；发布 ' . $adv['published'] . ' 条；逾期 ' . $adv['overdue'] . ' 条');
    return array(
        'ok' => true,
        'created' => $created,
        'published' => $adv['published'],
        'overdue' => $adv['overdue'],
        'today' => today_d(),
        'now' => now_dt(),
        'timezone' => isset($cfg['app']['timezone']) ? (string)$cfg['app']['timezone'] : 'Asia/Shanghai'
    );
}
