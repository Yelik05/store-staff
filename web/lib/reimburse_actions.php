<?php
/* reimburse_actions.php — 员工报销：分类配置、收款信息、报销单、店长审批与打款 */

function reimburse_category_out($r)
{
    return array(
        'id' => $r['id'],
        'name' => $r['name'],
        'sortOrder' => (int)$r['sort_order'],
        'enabled' => (bool)$r['enabled']
    );
}

function reimburse_categories_query($enabledOnly = false)
{
    $sql = 'SELECT * FROM reimburse_categories';
    if ($enabledOnly) $sql .= ' WHERE enabled = 1';
    $sql .= ' ORDER BY sort_order ASC, created_at ASC';
    return db()->query($sql)->fetchAll();
}

function reimburse_category_by_id($id)
{
    $st = db()->prepare('SELECT * FROM reimburse_categories WHERE id = ?');
    $st->execute(array((string)$id));
    $r = $st->fetch();
    return $r ? $r : null;
}

function next_reimburse_category_id()
{
    return 'RC' . date('ymdHis') . substr(md5(uniqid('', true)), 0, 4);
}

function next_payee_id()
{
    return 'PY' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 4);
}

function next_claim_id()
{
    return 'BX' . date('YmdHis') . substr(md5(uniqid('', true)), 0, 6);
}

function reimburse_len($s)
{
    return function_exists('mb_strlen') ? mb_strlen((string)$s, 'UTF-8') : strlen((string)$s);
}

function reimburse_seed_default_categories()
{
    $rows = array(
        array('RC01', '门店日常外购', 1), array('RC02', '市内车费', 2), array('RC03', '打印文件', 3),
        array('RC04', '电话费', 4), array('RC05', '招聘费用', 5), array('RC06', '维修费', 6),
        array('RC07', '员工生日福利', 7), array('RC08', '健康证办理', 8), array('RC09', '客诉费', 9),
        array('RC10', '漏餐退款', 10)
    );
    $st = db()->prepare('INSERT IGNORE INTO reimburse_categories (id, name, sort_order, enabled, created_at) VALUES (?,?,?,?,?)');
    foreach ($rows as $r) {
        $st->execute(array($r[0], $r[1], $r[2], 1, now_dt()));
    }
}

/* ---------- 分类 ---------- */

function api_reimburse_categories($in)
{
    $acc = require_login();
    $enabledOnly = $acc['role'] !== 'superadmin';
    $list = array();
    foreach (reimburse_categories_query($enabledOnly) as $r) {
        $list[] = reimburse_category_out($r);
    }
    return array('list' => $list);
}

function api_reimburse_category_save($in)
{
    require_super();
    $id = in_str($in, 'id', 16);
    $name = trim((string)in_str($in, 'name', 40));
    if (reimburse_len($name) < 2) throw new ApiException('分类名称至少 2 个字');
    if (reimburse_len($name) > 20) throw new ApiException('分类名称不能超过 20 个字');

    $st = db()->prepare('SELECT id FROM reimburse_categories WHERE name = ? AND id <> ?');
    $st->execute(array($name, $id));
    if ($st->fetch()) throw new ApiException('该分类名称已存在');

    $sortOrder = in_int($in, 'sortOrder', 0);
    $enabled = in_bool($in, 'enabled') ? 1 : 0;

    if ($id !== '') {
        $old = reimburse_category_by_id($id);
        if (!$old) throw new ApiException('分类不存在', 'NOT_FOUND', 404);
        if ($sortOrder === 0) $sortOrder = (int)$old['sort_order'];
        $st = db()->prepare('UPDATE reimburse_categories SET name=?, sort_order=?, enabled=?, updated_at=? WHERE id=?');
        $st->execute(array($name, $sortOrder, $enabled, now_dt(), $old['id']));
        audit_log('修改报销分类', $old['name'], $name . ($enabled ? '（启用）' : '（停用）'));
        return array('id' => $old['id']);
    }

    if ($sortOrder === 0) {
        $st = db()->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM reimburse_categories');
        $sortOrder = (int)$st->fetchColumn();
    }
    $nid = next_reimburse_category_id();
    $st = db()->prepare('INSERT INTO reimburse_categories (id, name, sort_order, enabled, created_at) VALUES (?,?,?,?,?)');
    $st->execute(array($nid, $name, $sortOrder, $enabled, now_dt()));
    audit_log('新增报销分类', $name, '排序 ' . $sortOrder);
    return array('id' => $nid);
}

/* ---------- 收款信息 ---------- */

function payee_out($r)
{
    return array(
        'id' => $r['id'],
        'type' => $r['type'],
        'account' => $r['account'],
        'bankName' => $r['bank_name'],
        'holderName' => $r['holder_name'],
        'isDefault' => (bool)$r['is_default'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at'])
    );
}

function payee_by_id($id, $staffId)
{
    $st = db()->prepare('SELECT * FROM staff_payees WHERE id = ? AND staff_id = ?');
    $st->execute(array((string)$id, (string)$staffId));
    $r = $st->fetch();
    return $r ? $r : null;
}

function payee_validate($in)
{
    $type = in_str($in, 'type', 12, 'alipay');
    if (!in_array($type, array('alipay', 'bank'), true)) throw new ApiException('请选择收款方式');
    $account = trim((string)in_str($in, 'account', 80));
    if ($account === '') throw new ApiException('请填写收款账号');
    $bankName = trim((string)in_str($in, 'bankName', 80));
    $holderName = trim((string)in_str($in, 'holderName', 40));
    if ($type === 'bank') {
        if ($bankName === '') throw new ApiException('请填写开户银行');
        if ($holderName === '') throw new ApiException('请填写持卡人姓名');
    }
    return array(
        'type' => $type, 'account' => $account,
        'bankName' => $bankName, 'holderName' => $holderName
    );
}

function payee_set_default($staffId, $payeeId)
{
    $st = db()->prepare('UPDATE staff_payees SET is_default = 0, updated_at = ? WHERE staff_id = ?');
    $st->execute(array(now_dt(), $staffId));
    $st = db()->prepare('UPDATE staff_payees SET is_default = 1, updated_at = ? WHERE id = ? AND staff_id = ?');
    $st->execute(array(now_dt(), $payeeId, $staffId));
}

function api_reimburse_payees($in)
{
    $acc = require_login();
    $st = db()->prepare('SELECT * FROM staff_payees WHERE staff_id = ? ORDER BY is_default DESC, created_at DESC');
    $st->execute(array($acc['staff_id']));
    $list = array();
    foreach ($st->fetchAll() as $r) $list[] = payee_out($r);
    return array('list' => $list);
}

function api_reimburse_payee_save($in)
{
    $acc = require_login();
    $staffId = (string)$acc['staff_id'];
    $id = in_str($in, 'id', 24);
    $v = payee_validate($in);
    $wantDefault = in_bool($in, 'isDefault');

    if ($id !== '') {
        $old = payee_by_id($id, $staffId);
        if (!$old) throw new ApiException('收款信息不存在', 'NOT_FOUND', 404);
        $st = db()->prepare('UPDATE staff_payees SET type=?, account=?, bank_name=?, holder_name=?, updated_at=? WHERE id=? AND staff_id=?');
        $st->execute(array($v['type'], $v['account'], $v['bankName'], $v['holderName'], now_dt(), $old['id'], $staffId));
        if ($wantDefault) payee_set_default($staffId, $old['id']);
        return array('id' => $old['id']);
    }

    $st = db()->prepare('SELECT COUNT(*) FROM staff_payees WHERE staff_id = ?');
    $st->execute(array($staffId));
    $isFirst = (int)$st->fetchColumn() === 0;

    $nid = next_payee_id();
    $st = db()->prepare('INSERT INTO staff_payees (id, staff_id, type, account, bank_name, holder_name, is_default, created_at) VALUES (?,?,?,?,?,?,?,?)');
    $st->execute(array($nid, $staffId, $v['type'], $v['account'], $v['bankName'], $v['holderName'], ($isFirst || $wantDefault) ? 1 : 0, now_dt()));
    if ($isFirst || $wantDefault) payee_set_default($staffId, $nid);
    return array('id' => $nid);
}

function api_reimburse_payee_delete($in)
{
    $acc = require_login();
    $staffId = (string)$acc['staff_id'];
    $row = payee_by_id(in_str($in, 'id', 24), $staffId);
    if (!$row) throw new ApiException('收款信息不存在', 'NOT_FOUND', 404);

    $st = db()->prepare('DELETE FROM staff_payees WHERE id = ? AND staff_id = ?');
    $st->execute(array($row['id'], $staffId));
    if ((int)$row['is_default'] === 1) {
        $st = db()->prepare('SELECT id FROM staff_payees WHERE staff_id = ? ORDER BY created_at DESC LIMIT 1');
        $st->execute(array($staffId));
        $next = $st->fetch();
        if ($next) payee_set_default($staffId, $next['id']);
    }
    return array('ok' => true);
}

function api_reimburse_payee_default($in)
{
    $acc = require_login();
    $staffId = (string)$acc['staff_id'];
    $row = payee_by_id(in_str($in, 'id', 24), $staffId);
    if (!$row) throw new ApiException('收款信息不存在', 'NOT_FOUND', 404);
    payee_set_default($staffId, $row['id']);
    return array('ok' => true);
}

/* ---------- 报销单 ---------- */

function claim_attachments($raw)
{
    $keys = json_field($raw, array());
    $out = array();
    foreach ($keys as $key) {
        $key = (string)$key;
        if ($key === '') continue;
        $name = '';
        $mime = '';
        $size = 0;
        $st = db()->prepare('SELECT original_name, mime, size FROM files WHERE file_key = ?');
        $st->execute(array($key));
        $f = $st->fetch();
        if ($f) {
            $name = $f['original_name'];
            $mime = $f['mime'];
            $size = (int)$f['size'];
        }
        $out[] = array('key' => $key, 'url' => 'uploads/' . $key, 'name' => $name, 'mime' => $mime, 'size' => $size);
    }
    return $out;
}

function claim_out($r)
{
    return array(
        'id' => $r['id'],
        'staffId' => $r['staff_id'],
        'staffName' => $r['staff_name'],
        'categoryId' => $r['category_id'],
        'categoryName' => $r['category_name'],
        'amount' => (float)$r['amount'],
        'reason' => $r['reason'],
        'attachments' => claim_attachments($r['attachments_json']),
        'payeeType' => $r['payee_type'],
        'payeeAccount' => $r['payee_account'],
        'payeeBank' => $r['payee_bank'],
        'payeeHolder' => $r['payee_holder'],
        'status' => $r['status'],
        'reviewerId' => $r['reviewer_id'] ? $r['reviewer_id'] : '',
        'reviewedBy' => $r['reviewed_by'],
        'reviewedAt' => $r['reviewed_at'] ? iso($r['reviewed_at']) : '',
        'rejectReason' => $r['reject_reason'],
        'paidBy' => $r['paid_by'],
        'paidAt' => $r['paid_at'] ? iso($r['paid_at']) : '',
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at'])
    );
}

function claim_by_id($id)
{
    $st = db()->prepare('SELECT * FROM reimburse_claims WHERE id = ?');
    $st->execute(array((string)$id));
    $r = $st->fetch();
    return $r ? $r : null;
}

function reimburse_claim_filters($in, &$params, $staffOnly = null)
{
    $where = array();
    if ($staffOnly !== null) {
        $where[] = 'c.staff_id = ?';
        $params[] = (string)$staffOnly;
    } else {
        $staffId = in_str($in, 'staffId', 16);
        if ($staffId !== '') {
            $where[] = 'c.staff_id = ?';
            $params[] = $staffId;
        }
    }
    $status = in_str($in, 'status', 12, 'all');
    if ($status !== '' && $status !== 'all') {
        if (!in_array($status, array('pending', 'approved', 'rejected', 'paid'), true)) throw new ApiException('报销状态不正确');
        $where[] = 'c.status = ?';
        $params[] = $status;
    }
    $cat = in_str($in, 'categoryId', 16);
    if ($cat !== '') {
        $where[] = 'c.category_id = ?';
        $params[] = $cat;
    }
    $from = in_str($in, 'from', 10);
    if ($from !== '') {
        $where[] = 'c.created_at >= ?';
        $params[] = $from . ' 00:00:00';
    }
    $to = in_str($in, 'to', 10);
    if ($to !== '') {
        $where[] = 'c.created_at <= ?';
        $params[] = $to . ' 23:59:59';
    }
    return $where;
}

function api_reimburse_my($in)
{
    $acc = require_login();
    $params = array();
    $where = reimburse_claim_filters($in, $params, $acc['staff_id']);
    $sql = 'SELECT * FROM reimburse_claims c' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.created_at DESC LIMIT 200';
    $st = db()->prepare($sql);
    $st->execute($params);
    $list = array();
    foreach ($st->fetchAll() as $r) $list[] = claim_out($r);
    return array('list' => $list);
}

function api_reimburse_get($in)
{
    $acc = require_login();
    $r = claim_by_id(in_str($in, 'id', 32));
    if (!$r) throw new ApiException('报销单不存在', 'NOT_FOUND', 404);
    if ($r['staff_id'] !== (string)$acc['staff_id'] && $acc['role'] !== 'superadmin') {
        throw new ApiException('无权查看他人的报销单', 'FORBIDDEN', 403);
    }
    return claim_out($r);
}

function api_reimburse_create($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    if (!$staff) throw new ApiException('未找到档案', 'NOT_FOUND', 404);
    if ($staff['status'] !== 'active') throw new ApiException('档案未通过审核或已停用，暂不能提交报销');

    $catId = in_str($in, 'categoryId', 16);
    $cat = reimburse_category_by_id($catId);
    if (!$cat || !(int)$cat['enabled']) throw new ApiException('请选择有效的报销分类');

    $amount = round(in_num($in, 'amount'), 2);
    if ($amount <= 0) throw new ApiException('报销金额需大于 0');
    if ($amount > 100000) throw new ApiException('单张报销金额不能超过 100000 元');

    $reason = trim((string)in_str($in, 'reason', 500));
    if (reimburse_len($reason) < 2) throw new ApiException('请填写报销原因（至少 2 个字）');
    if (reimburse_len($reason) > 500) throw new ApiException('报销原因不能超过 500 个字');

    $keys = array();
    if (isset($in['attachments']) && is_array($in['attachments'])) {
        foreach ($in['attachments'] as $k) {
            if (!is_string($k) || trim($k) === '') continue;
            $keys[] = trim($k);
        }
    }
    $keys = array_slice(array_values(array_unique($keys)), 0, 5);
    foreach ($keys as $k) {
        $st = db()->prepare('SELECT file_key FROM files WHERE file_key = ?');
        $st->execute(array($k));
        if (!$st->fetch()) throw new ApiException('附件不存在，请重新上传');
    }

    $payee = payee_validate($in);
    $payeeId = in_str($in, 'payeeId', 24);
    $wantDefault = in_bool($in, 'payeeDefault');
    if ($payeeId !== '') {
        $existing = payee_by_id($payeeId, $staff['id']);
        if (!$existing) throw new ApiException('收款信息不存在', 'NOT_FOUND', 404);
        $st = db()->prepare('UPDATE staff_payees SET type=?, account=?, bank_name=?, holder_name=?, updated_at=? WHERE id=?');
        $st->execute(array($payee['type'], $payee['account'], $payee['bankName'], $payee['holderName'], now_dt(), $existing['id']));
        if ($wantDefault) payee_set_default($staff['id'], $existing['id']);
    } else {
        $st = db()->prepare('SELECT COUNT(*) FROM staff_payees WHERE staff_id = ?');
        $st->execute(array($staff['id']));
        $isFirst = (int)$st->fetchColumn() === 0;
        $pid = next_payee_id();
        $st = db()->prepare('INSERT INTO staff_payees (id, staff_id, type, account, bank_name, holder_name, is_default, created_at) VALUES (?,?,?,?,?,?,?,?)');
        $st->execute(array($pid, $staff['id'], $payee['type'], $payee['account'], $payee['bankName'], $payee['holderName'], ($isFirst || $wantDefault) ? 1 : 0, now_dt()));
        if ($wantDefault && !$isFirst) payee_set_default($staff['id'], $pid);
    }

    $id = next_claim_id();
    $st = db()->prepare('INSERT INTO reimburse_claims (id, staff_id, staff_name, category_id, category_name, amount, reason, attachments_json, payee_type, payee_account, payee_bank, payee_holder, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute(array(
        $id, $staff['id'], str_limit(display_name($staff['name'], isset($staff['nickname']) ? $staff['nickname'] : ''), 40),
        $cat['id'], $cat['name'], $amount, $reason,
        json_encode($keys, JSON_UNESCAPED_UNICODE),
        $payee['type'], $payee['account'], $payee['bankName'], $payee['holderName'],
        'pending', now_dt()
    ));
    audit_log('提交报销', $staff['name'], $cat['name'] . ' ¥' . number_format($amount, 2));

    push_message($staff['id'], 'reimburse', '报销申请已提交',
        $cat['name'] . ' ¥' . number_format($amount, 2) . '，当前状态：待审核。', 'reimburse.html', $id);

    return array('id' => $id);
}

/* ---------- 店长审批 ---------- */

function api_reimburse_admin_list($in)
{
    require_super();
    $params = array();
    $where = reimburse_claim_filters($in, $params, null);
    $sql = 'SELECT * FROM reimburse_claims c' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY c.created_at DESC LIMIT 500';
    $st = db()->prepare($sql);
    $st->execute($params);
    $list = array();
    foreach ($st->fetchAll() as $r) $list[] = claim_out($r);

    $st = db()->query('SELECT status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM reimburse_claims GROUP BY status');
    $summary = array('pending' => 0, 'approved' => 0, 'rejected' => 0, 'paid' => 0);
    $counts = array('pending' => 0, 'approved' => 0, 'rejected' => 0, 'paid' => 0);
    foreach ($st->fetchAll() as $r) {
        $counts[$r['status']] = (int)$r['n'];
        $summary[$r['status']] = (float)$r['total'];
    }
    return array('list' => $list, 'counts' => $counts, 'amounts' => $summary);
}

function api_reimburse_admin_get($in)
{
    require_super();
    $r = claim_by_id(in_str($in, 'id', 32));
    if (!$r) throw new ApiException('报销单不存在', 'NOT_FOUND', 404);
    return claim_out($r);
}

function api_reimburse_review($in)
{
    $acc = require_super();
    $r = claim_by_id(in_str($in, 'id', 32));
    if (!$r) throw new ApiException('报销单不存在', 'NOT_FOUND', 404);
    if ($r['status'] !== 'pending') throw new ApiException('仅待审核的报销单可以审核');

    $action = in_str($in, 'action', 12);
    if (!in_array($action, array('approve', 'reject'), true)) throw new ApiException('审核操作不正确');
    $reason = '';
    $status = 'approved';
    if ($action === 'reject') {
        $reason = trim((string)in_str($in, 'reason', 200));
        if (reimburse_len($reason) < 2) throw new ApiException('驳回时请填写原因（至少 2 个字）');
        if (reimburse_len($reason) > 200) throw new ApiException('驳回原因不能超过 200 个字');
        $status = 'rejected';
    }

    $st = db()->prepare('UPDATE reimburse_claims SET status=?, reviewer_id=?, reviewed_by=?, reviewed_at=?, reject_reason=?, updated_at=? WHERE id=?');
    $st->execute(array($status, $acc['staff_id'], $acc['name'], now_dt(), $reason, now_dt(), $r['id']));

    $money = '¥' . number_format((float)$r['amount'], 2);
    if ($status === 'approved') {
        audit_log('通过报销', $r['staff_name'], $r['category_name'] . ' ' . $money);
        push_message($r['staff_id'], 'reimburse', '报销申请已通过',
            $r['category_name'] . ' ' . $money . ' 已通过，等待门店打款。', 'reimburse.html', $r['id']);
    } else {
        audit_log('驳回报销', $r['staff_name'], $r['category_name'] . ' ' . $money . '：' . $reason);
        push_message($r['staff_id'], 'reimburse', '报销申请被驳回',
            $r['category_name'] . ' ' . $money . ' 被驳回：' . $reason, 'reimburse.html', $r['id']);
    }
    return array('status' => $status);
}

function api_reimburse_pay($in)
{
    $acc = require_super();
    $r = claim_by_id(in_str($in, 'id', 32));
    if (!$r) throw new ApiException('报销单不存在', 'NOT_FOUND', 404);
    if ($r['status'] !== 'approved') throw new ApiException('仅已通过的报销单可以标记打款');

    $st = db()->prepare('UPDATE reimburse_claims SET status=?, paid_by=?, paid_at=?, updated_at=? WHERE id=?');
    $st->execute(array('paid', $acc['name'], now_dt(), now_dt(), $r['id']));

    $money = '¥' . number_format((float)$r['amount'], 2);
    audit_log('报销打款', $r['staff_name'], $r['category_name'] . ' ' . $money);
    push_message($r['staff_id'], 'reimburse', '报销已打款',
        $r['category_name'] . ' ' . $money . ' 已打款，请注意查收。', 'reimburse.html', $r['id']);
    return array('status' => 'paid');
}
