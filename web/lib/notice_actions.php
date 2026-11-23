<?php
/* notice_actions.php — 门店通知：发布、撤回、员工阅读与已读统计 */

function notice_categories()
{
    return array('总部通知', '餐厅通知', '门店通知');
}

/* 历史「新品上新」统一并入「总部通知」，兼容未执行迁移的旧库 */
function notice_category_norm($cat)
{
    return $cat === '新品上新' ? '总部通知' : $cat;
}

function notice_category_ok($cat)
{
    return in_array($cat, notice_categories(), true);
}

function notice_out($r, $readAt = null)
{
    return array(
        'id' => $r['id'],
        'category' => notice_category_norm($r['category']),
        'title' => $r['title'],
        'body' => $r['body'],
        'status' => $r['status'],
        'pinned' => (bool)$r['pinned'],
        'important' => (bool)$r['important'],
        'publisher' => $r['publisher'],
        'publishAt' => !empty($r['publish_at']) ? iso($r['publish_at']) : '',
        'publishedAt' => $r['published_at'] ? iso($r['published_at']) : '',
        'createdAt' => iso($r['created_at']),
        'read' => $readAt !== null && $readAt !== '',
        'readAt' => $readAt ? iso($readAt) : ''
    );
}

/*
 * 无 cron 的降级方案：每次员工端/管理端读取通知前，先把已到点的定时通知转为已发布。
 * 员工打开任意页面都会触发 noticeUnread，因此定时通知最迟在员工下次进入应用时可见。
 */
function notice_activate_due()
{
    $now = now_dt();
    $st = db()->prepare("SELECT id FROM notices WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= ?");
    $st->execute(array($now));
    $ids = $st->fetchAll(PDO::FETCH_COLUMN);
    if (!$ids) return 0;

    $up = db()->prepare("UPDATE notices SET status = 'published', published_at = COALESCE(published_at, publish_at), updated_at = ? WHERE id = ? AND status = 'scheduled'");
    $activated = 0;
    foreach ($ids as $id) {
        $up->execute(array($now, $id));
        if ($up->rowCount() > 0) {
            $activated++;
            /* 到点真正发布时投递飞书 webhook；失败不影响发布 */
            if (function_exists('feishu_webhook_notice_publish')) feishu_webhook_notice_publish($id, true);
        }
    }
    return $activated;
}

function notice_require_manage($category)
{
    $acc = require_admin();
    if ($category === '总部通知') {
        require_super();
    }
    return $acc;
}

function api_notice_employee_list($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $cat = in_str($in, 'category', 20);
    if ($cat !== '' && !notice_category_ok($cat)) throw new ApiException('通知分类不正确');
    notice_activate_due();

    /* 分页：page 为空时返回全部（供顶部轮播等场景），信箱传入 page 时按每页 5 条取数 */
    $page = isset($in['page']) && $in['page'] !== '' ? (int)$in['page'] : 0;
    if ($page < 0) $page = 0;
    $pageSize = (int)in_str($in, 'pageSize', 10);
    if ($pageSize < 1 || $pageSize > 50) $pageSize = 5;

    $where = "n.status = 'published'";
    $whereParams = array();
    if ($cat !== '') {
        if ($cat === '总部通知') {
            $where .= " AND n.category IN ('总部通知','新品上新')";
        } else {
            $where .= ' AND n.category = ?';
            $whereParams[] = $cat;
        }
    }

    $cst = db()->prepare('SELECT COUNT(*) FROM notices n WHERE ' . $where);
    $cst->execute($whereParams);
    $total = (int)$cst->fetchColumn();

    $sql = "SELECT n.*, r.read_at FROM notices n LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.staff_id = ? WHERE " . $where;
    $params = array_merge(array($staff['id']), $whereParams);
    $sql .= ' ORDER BY n.pinned DESC, n.published_at DESC, n.created_at DESC';
    if ($page > 0) {
        $offset = ($page - 1) * $pageSize;
        $sql .= ' LIMIT ' . $pageSize . ' OFFSET ' . $offset;
    }
    $st = db()->prepare($sql);
    $st->execute($params);
    $list = array();
    foreach ($st->fetchAll() as $r) {
        $list[] = notice_out($r, $r['read_at']);
    }

    $st = db()->prepare("SELECT n.category, COUNT(*) AS total, SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS unread FROM notices n LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.staff_id = ? WHERE n.status = 'published' GROUP BY n.category");
    $st->execute(array($staff['id']));
    $counts = array();
    foreach (notice_categories() as $c) $counts[$c] = array('total' => 0, 'unread' => 0);
    foreach ($st->fetchAll() as $r) {
        $c = notice_category_norm($r['category']);
        if (!isset($counts[$c])) continue;
        $counts[$c]['total'] += (int)$r['total'];
        $counts[$c]['unread'] += (int)$r['unread'];
    }
    $unreadTotal = 0;
    foreach ($counts as $c) $unreadTotal += $c['unread'];

    return array(
        'list' => $list,
        'total' => $total,
        'page' => $page > 0 ? $page : 1,
        'pageSize' => $pageSize,
        'totalPages' => $total > 0 ? (int)ceil($total / $pageSize) : 1,
        'counts' => $counts,
        'unreadTotal' => $unreadTotal,
        'categories' => notice_categories()
    );
}

function api_notice_unread($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    notice_activate_due();

    $st = db()->prepare("SELECT n.category, COUNT(*) AS total, SUM(CASE WHEN r.id IS NULL THEN 1 ELSE 0 END) AS unread FROM notices n LEFT JOIN notice_reads r ON r.notice_id = n.id AND r.staff_id = ? WHERE n.status = 'published' GROUP BY n.category");
    $st->execute(array($staff['id']));
    $counts = array();
    foreach (notice_categories() as $c) $counts[$c] = array('total' => 0, 'unread' => 0);
    $total = 0;
    foreach ($st->fetchAll() as $r) {
        $c = notice_category_norm($r['category']);
        if (!isset($counts[$c])) continue;
        $counts[$c]['total'] += (int)$r['total'];
        $counts[$c]['unread'] += (int)$r['unread'];
        $total += (int)$r['unread'];
    }
    return array('unreadTotal' => $total, 'counts' => $counts);
}

function api_notice_employee_get($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    notice_activate_due();
    $st = db()->prepare("SELECT * FROM notices WHERE id = ? AND status = 'published'");
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('通知不存在或已撤回', 'NOT_FOUND', 404);
    $st = db()->prepare('SELECT read_at FROM notice_reads WHERE notice_id = ? AND staff_id = ?');
    $st->execute(array($r['id'], $staff['id']));
    $read = $st->fetch();
    return notice_out($r, $read ? $read['read_at'] : null);
}

function api_notice_mark_read($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    $id = isset($in['id']) ? (string)$in['id'] : '';
    $st = db()->prepare("SELECT id FROM notices WHERE id = ? AND status = 'published'");
    $st->execute(array($id));
    if (!$st->fetch()) throw new ApiException('通知不存在或已撤回', 'NOT_FOUND', 404);

    $st = db()->prepare('INSERT IGNORE INTO notice_reads (notice_id, staff_id, read_at) VALUES (?,?,?)');
    $st->execute(array($id, $staff['id'], now_dt()));
    $st = db()->prepare('SELECT read_at FROM notice_reads WHERE notice_id = ? AND staff_id = ?');
    $st->execute(array($id, $staff['id']));
    $read = $st->fetch();
    return array('ok' => true, 'readAt' => $read ? iso($read['read_at']) : iso(now_dt()));
}

function api_notice_admin_list($in)
{
    require_admin();
    notice_activate_due();
    $cat = in_str($in, 'category', 20);
    $status = in_str($in, 'status', 12, 'all');
    $sql = 'SELECT n.*, (SELECT COUNT(*) FROM notice_reads r WHERE r.notice_id = n.id) AS read_count FROM notices n';
    $where = array();
    $params = array();
    if ($cat !== '') {
        if (!notice_category_ok($cat)) throw new ApiException('通知分类不正确');
        if ($cat === '总部通知') {
            $where[] = "n.category IN ('总部通知','新品上新')";
        } else {
            $where[] = 'n.category = ?';
            $params[] = $cat;
        }
    }
    if ($status !== 'all') {
        $where[] = 'n.status = ?';
        $params[] = $status;
    }
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY n.pinned DESC, COALESCE(n.published_at, n.publish_at, n.created_at) DESC';

    $st = db()->prepare('SELECT COUNT(*) FROM staff WHERE status = ?');
    $st->execute(array('active'));
    $activeTotal = (int)$st->fetchColumn();

    $st = db()->prepare($sql);
    $st->execute($params);
    $list = array();
    foreach ($st->fetchAll() as $r) {
        $item = notice_out($r);
        $item['readCount'] = (int)$r['read_count'];
        $item['totalStaff'] = $activeTotal;
        $item['unreadCount'] = max(0, $activeTotal - (int)$r['read_count']);
        $list[] = $item;
    }
    return array('list' => $list, 'activeTotal' => $activeTotal, 'categories' => notice_categories());
}

function api_notice_admin_save($in)
{
    $id = in_str($in, 'id', 24);
    $old = null;
    if ($id !== '') {
        $st = db()->prepare('SELECT * FROM notices WHERE id = ?');
        $st->execute(array($id));
        $old = $st->fetch();
        if (!$old) throw new ApiException('通知不存在', 'NOT_FOUND', 404);
        notice_require_manage($old['category']);
    }
    $category = in_str($in, 'category', 20);
    if (!notice_category_ok($category)) throw new ApiException('请选择通知分类');
    $acc = notice_require_manage($category);

    $title = in_str($in, 'title', 120);
    $tlen = function_exists('mb_strlen') ? mb_strlen($title, 'UTF-8') : strlen($title);
    if ($tlen < 2) throw new ApiException('标题至少 2 个字');
    $body = in_str($in, 'body', 5000);
    $blen = function_exists('mb_strlen') ? mb_strlen($body, 'UTF-8') : strlen($body);
    if ($blen < 5) throw new ApiException('正文至少 5 个字');
    $status = in_str($in, 'status', 12, 'published');
    if (!in_array($status, array('draft', 'published', 'withdrawn', 'scheduled'), true)) throw new ApiException('通知状态不正确');
    $publishAt = null;
    if ($status === 'scheduled') {
        $raw = trim(str_replace('T', ' ', in_str($in, 'publishAt', 25)));
        if (strlen($raw) === 16) $raw .= ':00';
        $ts = $raw !== '' ? strtotime($raw) : false;
        if ($ts === false) throw new ApiException('请选择定时发布时间');
        $publishAt = date('Y-m-d H:i:s', $ts);
        if ($publishAt <= now_dt()) throw new ApiException('定时发布时间需晚于当前时间');
    }
    $pinned = in_bool($in, 'pinned') ? 1 : 0;
    $important = in_bool($in, 'important') ? 1 : 0;
    /* 发布人可自定义；留空沿用当前登录账号姓名 */
    $publisher = trim((string)in_str($in, 'publisher', 40));
    if ($publisher === '') $publisher = (string)$acc['name'];

    if ($old) {
        $publishedAt = $old['published_at'];
        if ($status === 'published' && !$publishedAt) $publishedAt = now_dt();
        $st = db()->prepare('UPDATE notices SET category=?, title=?, body=?, publisher=?, status=?, pinned=?, important=?, publish_at=?, published_at=?, updated_at=? WHERE id=?');
        $st->execute(array($category, $title, $body, $publisher, $status, $pinned, $important, $publishAt, $publishedAt, now_dt(), $old['id']));
        audit_log('编辑通知', $category, $title);
        /* 从草稿 / 定时 / 撤回再次发布时投递一次；仅编辑已发布通知不重复推 */
        if ($status === 'published' && $old['status'] !== 'published' && function_exists('feishu_webhook_notice_publish')) {
            feishu_webhook_notice_publish($old['id'], $old['status'] === 'scheduled');
        }
        return array('id' => $old['id']);
    }

    $nid = next_notice_id();
    $publishedAt = $status === 'published' ? now_dt() : null;
    $st = db()->prepare('INSERT INTO notices (id, category, title, body, status, pinned, important, publisher, publisher_id, publish_at, published_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL)');
    $st->execute(array($nid, $category, $title, $body, $status, $pinned, $important, $publisher, $acc['staff_id'], $publishAt, $publishedAt, now_dt()));
    audit_log($status === 'scheduled' ? '定时通知' : '发布通知', $category, $title);
    if ($status === 'published' && function_exists('feishu_webhook_notice_publish')) {
        feishu_webhook_notice_publish($nid, false);
    }
    return array('id' => $nid);
}

function api_notice_admin_withdraw($in)
{
    $st = db()->prepare('SELECT * FROM notices WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('通知不存在', 'NOT_FOUND', 404);
    notice_require_manage($r['category']);
    $st = db()->prepare("UPDATE notices SET status='withdrawn', updated_at=? WHERE id=?");
    $st->execute(array(now_dt(), $r['id']));
    audit_log('撤回通知', $r['category'], $r['title']);
    return array('status' => 'withdrawn');
}

function api_notice_admin_delete($in)
{
    require_super();
    $st = db()->prepare('SELECT * FROM notices WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('通知不存在', 'NOT_FOUND', 404);
    $st = db()->prepare('DELETE FROM notices WHERE id = ?');
    $st->execute(array($r['id']));
    audit_log('删除通知', $r['category'], $r['title']);
    return array('ok' => true);
}

function api_notice_admin_readers($in)
{
    require_admin();
    $st = db()->prepare('SELECT * FROM notices WHERE id = ?');
    $st->execute(array(isset($in['id']) ? (string)$in['id'] : ''));
    $r = $st->fetch();
    if (!$r) throw new ApiException('通知不存在', 'NOT_FOUND', 404);
    if ($r['status'] !== 'published') throw new ApiException('通知尚未发布，暂无了解明细');

    $st = db()->prepare('SELECT s.id, s.name, s.position, s.emp_no, s.feishu_emp_no, s.employment_type, r.read_at FROM notice_reads r INNER JOIN staff s ON s.id = r.staff_id WHERE r.notice_id = ? ORDER BY r.read_at ASC');
    $st->execute(array($r['id']));
    $readers = array();
    $readIds = array();
    foreach ($st->fetchAll() as $x) {
        $readIds[] = $x['id'];
        $readers[] = array(
            'id' => $x['id'], 'name' => $x['name'], 'position' => normalize_position($x['position']),
            'empNo' => $x['emp_no'], 'feishuEmpNo' => isset($x['feishu_emp_no']) ? $x['feishu_emp_no'] : '', 'employmentType' => $x['employment_type'], 'readAt' => iso($x['read_at'])
        );
    }

    $st = db()->prepare("SELECT id, name, position, emp_no, feishu_emp_no, employment_type FROM staff WHERE status = 'active' ORDER BY FIELD(position, '店长','店助','值班经理','店员'), emp_no");
    $st->execute();
    $unread = array();
    foreach ($st->fetchAll() as $x) {
        if (in_array($x['id'], $readIds, true)) continue;
        $unread[] = array(
            'id' => $x['id'], 'name' => $x['name'], 'position' => normalize_position($x['position']),
            'empNo' => $x['emp_no'], 'feishuEmpNo' => isset($x['feishu_emp_no']) ? $x['feishu_emp_no'] : '', 'employmentType' => $x['employment_type']
        );
    }

    return array(
        'notice' => notice_out($r),
        'readers' => $readers,
        'unread' => $unread,
        'readCount' => count($readers),
        'unreadCount' => count($unread)
    );
}
