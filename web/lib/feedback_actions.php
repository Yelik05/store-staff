<?php
/* feedback_actions.php — 匿名反馈：员工提交、超管与反馈人往返回复
 * 匿名边界：接口只返回反馈内容 / 时间 / 回复，不返回提交人、回复人的姓名、工号、头像；
 * staff_id / author_staff_id 仅落库留痕，用于必要时追责。
 */

function feedback_len($s)
{
    $s = (string)$s;
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

function feedback_cut($s, $len)
{
    $s = (string)$s;
    return function_exists('mb_substr') ? mb_substr($s, 0, $len, 'UTF-8') : substr($s, 0, $len);
}

function next_feedback_id()
{
    return 'FB' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 6);
}

function next_feedback_reply_id()
{
    return 'FR' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 6);
}

/* 接收匿名反馈的超管账号（可能多人，只取有效账号绑定的员工） */
function feedback_super_staff_ids()
{
    $out = array();
    try {
        $rows = db()->query("SELECT DISTINCT staff_id FROM accounts WHERE role = 'superadmin' AND status = 'active' AND staff_id <> ''")->fetchAll();
        foreach ($rows as $r) {
            $sid = (string)$r['staff_id'];
            if ($sid !== '' && !in_array($sid, $out, true)) $out[] = $sid;
        }
    } catch (Exception $e) { /* 忽略 */ }
    return $out;
}

function feedback_row($id)
{
    $st = db()->prepare('SELECT * FROM feedbacks WHERE id = ?');
    $st->execute(array((string)$id));
    $r = $st->fetch();
    return $r ? $r : null;
}

function feedback_can_view($fb, $acc)
{
    if (!$fb) return false;
    if ($acc['role'] === 'superadmin') return true;
    return (string)$fb['staff_id'] === (string)$acc['staff_id'];
}

function feedback_thread_out($fb, $isSuper)
{
    $st = db()->prepare('SELECT * FROM feedback_replies WHERE feedback_id = ? ORDER BY created_at ASC, id ASC');
    $st->execute(array($fb['id']));
    $replies = array();
    foreach ($st->fetchAll() as $r) {
        /* 只给出角色与内容，不给出任何人员标识 */
        $replies[] = array(
            'id' => $r['id'],
            'role' => $r['author_role'] === 'super' ? 'super' : 'staff',
            'content' => $r['content'],
            'createdAt' => iso($r['created_at'])
        );
    }
    return array(
        'id' => $fb['id'],
        'content' => $fb['content'],
        'createdAt' => iso($fb['created_at']),
        'lastAt' => iso($fb['last_at']),
        'replies' => $replies,
        'isSuper' => $isSuper,
        'canReply' => true
    );
}

/* 提交反馈：写入 feedbacks（含 staff_id 留痕），并以站内消息 + 飞书个人提醒通知全部超管 */
function api_feedback_submit($in)
{
    $acc = require_login();
    $content = trim((string)(isset($in['content']) ? $in['content'] : ''));
    $len = feedback_len($content);
    if ($len < 2) throw new ApiException('请填写反馈内容');
    if ($len > 500) throw new ApiException('反馈内容不能超过 500 字');

    /* 基本防刷：同一账号 10 分钟内最多 3 条 */
    $st = db()->prepare('SELECT COUNT(*) FROM feedbacks WHERE staff_id = ? AND created_at >= ?');
    $st->execute(array((string)$acc['staff_id'], date('Y-m-d H:i:s', strtotime(now_dt()) - 600)));
    if ((int)$st->fetchColumn() >= 3) {
        throw new ApiException('提交过于频繁，请 10 分钟后再试', 'FEEDBACK_RATE_LIMIT', 429);
    }

    $id = next_feedback_id();
    $now = now_dt();
    $st = db()->prepare('INSERT INTO feedbacks (id, staff_id, content, last_at, created_at, updated_at) VALUES (?,?,?,?,?,?)');
    $st->execute(array($id, (string)$acc['staff_id'], $content, $now, $now, $now));

    $summary = feedback_cut($content, 80);
    foreach (feedback_super_staff_ids() as $sid) {
        push_message($sid, 'feedback', '匿名反馈', $summary, 'messages.html?feedback=' . $id, $id, 'personal.feedback|' . $id . '|' . $sid);
    }

    return array('ok' => true, 'id' => $id, 'createdAt' => iso($now));
}

/* 查看反馈往来：仅超管或该反馈提交人；打开时把自己相关的通知标记为已读 */
function api_feedback_thread($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 32);
    if ($id === '') throw new ApiException('反馈不存在或已删除', 'NOT_FOUND', 404);
    $fb = feedback_row($id);
    if (!$fb) throw new ApiException('反馈不存在或已删除', 'NOT_FOUND', 404);
    if (!feedback_can_view($fb, $acc)) throw new ApiException('无权查看该反馈', 'FORBIDDEN', 403);

    try {
        $st = db()->prepare("UPDATE messages SET read_at = ? WHERE staff_id = ? AND type = 'feedback' AND ref_id = ? AND read_at IS NULL");
        $st->execute(array(now_dt(), (string)$acc['staff_id'], $id));
    } catch (Exception $e) { /* 忽略 */ }

    return feedback_thread_out($fb, $acc['role'] === 'superadmin');
}

/* 回复：超管回复反馈人；反馈人回复时通知全部超管。均不暴露人员身份 */
function api_feedback_reply($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 32);
    $content = trim((string)(isset($in['content']) ? $in['content'] : ''));
    if ($id === '') throw new ApiException('反馈不存在或已删除', 'NOT_FOUND', 404);
    $len = feedback_len($content);
    if ($len < 1) throw new ApiException('请输入回复内容');
    if ($len > 500) throw new ApiException('回复内容不能超过 500 字');

    $fb = feedback_row($id);
    if (!$fb) throw new ApiException('反馈不存在或已删除', 'NOT_FOUND', 404);
    if (!feedback_can_view($fb, $acc)) throw new ApiException('无权回复该反馈', 'FORBIDDEN', 403);

    $isSuper = $acc['role'] === 'superadmin';
    $rid = next_feedback_reply_id();
    $now = now_dt();
    $st = db()->prepare('INSERT INTO feedback_replies (id, feedback_id, author_role, author_staff_id, content, created_at) VALUES (?,?,?,?,?,?)');
    $st->execute(array($rid, $id, $isSuper ? 'super' : 'staff', (string)$acc['staff_id'], $content, $now));
    $st = db()->prepare('UPDATE feedbacks SET last_at = ?, updated_at = ? WHERE id = ?');
    $st->execute(array($now, $now, $id));

    $summary = feedback_cut($content, 80);
    if ($isSuper) {
        /* 超管回复：只提醒反馈人，不带任何提交人信息 */
        push_message((string)$fb['staff_id'], 'feedback', '匿名反馈回复', $summary, 'messages.html?feedback=' . $id, $id,
            'personal.feedback_reply|' . $id . '|' . $rid . '|' . $fb['staff_id']);
    } else {
        /* 反馈人继续回复：提醒全部超管，由他们继续查看 */
        foreach (feedback_super_staff_ids() as $sid) {
            push_message($sid, 'feedback', '匿名反馈有新回复', $summary, 'messages.html?feedback=' . $id, $id,
                'personal.feedback_reply|' . $id . '|' . $rid . '|' . $sid);
        }
    }

    return array('ok' => true, 'id' => $rid, 'createdAt' => iso($now));
}
