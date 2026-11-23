<?php
/* 效期检查：分类 / 原物料 / 每日登记与处理 */

function expiry_uid($prefix)
{
    return $prefix . date('YmdHis') . substr(md5(uniqid('', true)), 0, 6);
}

function expiry_category_out($r)
{
    return array(
        'id' => $r['id'],
        'name' => $r['name'],
        'sortOrder' => (int)$r['sort_order'],
        'enabled' => (bool)$r['enabled'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at'])
    );
}

function expiry_material_out($r)
{
    return array(
        'id' => $r['id'],
        'categoryId' => $r['category_id'],
        'name' => $r['name'],
        'defaultMode' => $r['default_mode'],
        'defaultHours' => (float)$r['default_hours'],
        'defaultTime' => substr((string)$r['default_time'], 0, 5),
        'closeDue' => (bool)$r['close_due'],
        'sortOrder' => (int)$r['sort_order'],
        'enabled' => (bool)$r['enabled'],
        'remark' => $r['remark'],
        'createdAt' => iso($r['created_at']),
        'updatedAt' => iso($r['updated_at'])
    );
}

function expiry_record_out($r)
{
    return array(
        'id' => $r['id'],
        'materialId' => $r['material_id'],
        'categoryId' => $r['category_id'],
        'materialName' => $r['material_name'],
        'categoryName' => $r['category_name'],
        'checkDate' => $r['check_date'],
        'dueAt' => iso($r['due_at']),
        'note' => $r['note'],
        'status' => $r['status'],
        'processedBy' => $r['processed_by'],
        'processedAt' => iso($r['processed_at']),
        'createdBy' => $r['created_by'],
        'createdAt' => iso($r['created_at']),
        'updatedBy' => $r['updated_by'],
        'updatedAt' => iso($r['updated_at'])
    );
}

function expiry_material_row($id)
{
    $st = db()->prepare('SELECT * FROM expiry_materials WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

function expiry_category_row($id)
{
    $st = db()->prepare('SELECT * FROM expiry_categories WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

/* 门店默认打烊时间：用于「默认打烊到期」的原物料 */
function expiry_close_time()
{
    $s = settings_data();
    $t = isset($s['expiryCloseTime']) ? (string)$s['expiryCloseTime'] : '';
    return preg_match('/^\d{2}:\d{2}$/', $t) ? $t : '23:00';
}

function expiry_record_row($id)
{
    $st = db()->prepare('SELECT * FROM expiry_records WHERE id = ?');
    $st->execute(array($id));
    $row = $st->fetch();
    return $row ? $row : null;
}

/* 演示重置后补回默认分类与原物料 */
function expiry_seed_defaults()
{
    $count = (int)db()->query('SELECT COUNT(*) FROM expiry_categories')->fetchColumn();
    if ($count > 0) return;
    $now = now_dt();
    $st = db()->prepare('INSERT IGNORE INTO expiry_categories (id, name, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)');
    foreach (array(
        array('EC01', '冷藏', 1), array('EC02', '常温', 2),
        array('EC03', '冷冻', 3), array('EC04', '打烊', 4)
    ) as $c) {
        $st->execute(array($c[0], $c[1], $c[2], 1, $now, $now));
    }
    $st = db()->prepare('INSERT IGNORE INTO expiry_materials (id, category_id, name, default_mode, default_hours, default_time, close_due, sort_order, enabled, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach (array(
        array('EM01', 'EC01', '生菜', 'time', 0, '23:00', 1, 1, '打烊到期'),
        array('EM02', 'EC01', '切片番茄', 'hours', 24, '', 0, 2, ''),
        array('EM03', 'EC02', '面包胚', 'hours', 48, '', 0, 3, ''),
        array('EM04', 'EC02', '酱料包', 'time', 0, '22:00', 0, 4, ''),
        array('EM05', 'EC03', '冷冻鸡排', 'time', 0, '22:00', 1, 5, '')
    ) as $m) {
        $st->execute(array($m[0], $m[1], $m[2], $m[3], $m[4], $m[5], $m[6], $m[7], 1, $m[8], $now, $now));
    }
}

function api_expiry_admin_data($in)
{
    require_super();
    $categories = array();
    foreach (db()->query('SELECT * FROM expiry_categories ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
        $categories[] = expiry_category_out($r);
    }
    $materials = array();
    foreach (db()->query('SELECT * FROM expiry_materials ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
        $materials[] = expiry_material_out($r);
    }
    return array('closeTime' => expiry_close_time(), 'categories' => $categories, 'materials' => $materials);
}

function api_expiry_config($in)
{
    require_login();
    $categories = array();
    foreach (db()->query('SELECT * FROM expiry_categories WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
        $categories[] = expiry_category_out($r);
    }
    $materials = array();
    foreach (db()->query('SELECT * FROM expiry_materials WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll() as $r) {
        $materials[] = expiry_material_out($r);
    }
    return array('closeTime' => expiry_close_time(), 'categories' => $categories, 'materials' => $materials);
}

function api_expiry_close_time_save($in)
{
    require_super();
    $t = substr(trim(in_str($in, 'closeTime', 5, '')), 0, 5);
    if (!preg_match('/^\d{2}:\d{2}$/', $t)) throw new ApiException('请选择有效的打烊时间');
    $s = settings_data();
    $s['expiryCloseTime'] = $t;
    save_settings_data($s);
    audit_log('修改默认打烊时间', $t, '效期配置');
    return array('ok' => true, 'closeTime' => $t);
}

function api_expiry_category_save($in)
{
    require_super();
    $id = in_str($in, 'id', 32, '');
    $name = trim(in_str($in, 'name', 60, ''));
    if ($name === '') throw new ApiException('请填写分类名称');
    if (mb_strlen($name) > 20) throw new ApiException('分类名称不能超过 20 个字');
    $sortOrder = isset($in['sortOrder']) ? (int)$in['sortOrder'] : 0;
    $enabled = !isset($in['enabled']) || $in['enabled'] !== false;
    $st = db()->prepare('SELECT id FROM expiry_categories WHERE name = ? AND id <> ?');
    $st->execute(array($name, $id));
    if ($st->fetchColumn()) throw new ApiException('该分类名称已存在');

    if ($id !== '') {
        $old = expiry_category_row($id);
        if (!$old) throw new ApiException('分类不存在', 'NOT_FOUND', 404);
        $st = db()->prepare('UPDATE expiry_categories SET name=?, sort_order=?, enabled=?, updated_at=? WHERE id=?');
        $st->execute(array($name, $sortOrder, $enabled ? 1 : 0, now_dt(), $id));
        audit_log('修改效期分类', $name, $enabled ? '启用' : '停用');
    } else {
        $id = expiry_uid('EC');
        $st = db()->prepare('INSERT INTO expiry_categories (id, name, sort_order, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?)');
        $st->execute(array($id, $name, $sortOrder, $enabled ? 1 : 0, now_dt(), now_dt()));
        audit_log('新增效期分类', $name, '');
    }
    return array('id' => $id);
}

function api_expiry_category_toggle($in)
{
    require_super();
    $id = in_str($in, 'id', 32);
    $row = expiry_category_row($id);
    if (!$row) throw new ApiException('分类不存在', 'NOT_FOUND', 404);
    $enabled = !empty($in['enabled']);
    $st = db()->prepare('UPDATE expiry_categories SET enabled=?, updated_at=? WHERE id=?');
    $st->execute(array($enabled ? 1 : 0, now_dt(), $id));
    audit_log($enabled ? '启用效期分类' : '停用效期分类', $row['name'], '');
    return array('ok' => true);
}

/* 删除口径：分类下仍有原物料、或分类/原物料已被登记记录引用时禁止删除，改为停用 */
function api_expiry_category_delete($in)
{
    require_super();
    $id = in_str($in, 'id', 32);
    $row = expiry_category_row($id);
    if (!$row) throw new ApiException('分类不存在', 'NOT_FOUND', 404);
    $st = db()->prepare('SELECT COUNT(*) FROM expiry_materials WHERE category_id = ?');
    $st->execute(array($id));
    if ((int)$st->fetchColumn() > 0) throw new ApiException('该分类下仍有原物料，请先删除或调整原物料后再删除分类');
    $st = db()->prepare('SELECT COUNT(*) FROM expiry_records WHERE category_id = ?');
    $st->execute(array($id));
    if ((int)$st->fetchColumn() > 0) throw new ApiException('该分类已有登记记录，无法删除；请改为停用，历史记录将保留');
    $st = db()->prepare('DELETE FROM expiry_categories WHERE id = ?');
    $st->execute(array($id));
    audit_log('删除效期分类', $row['name'], '');
    return array('ok' => true);
}

function api_expiry_material_delete($in)
{
    require_super();
    $id = in_str($in, 'id', 32);
    $row = expiry_material_row($id);
    if (!$row) throw new ApiException('原物料不存在', 'NOT_FOUND', 404);
    $st = db()->prepare('SELECT COUNT(*) FROM expiry_records WHERE material_id = ?');
    $st->execute(array($id));
    if ((int)$st->fetchColumn() > 0) throw new ApiException('该原物料已有登记记录，无法删除；请改为停用，历史记录将保留');
    $st = db()->prepare('DELETE FROM expiry_materials WHERE id = ?');
    $st->execute(array($id));
    audit_log('删除效期原物料', $row['name'], '');
    return array('ok' => true);
}

function api_expiry_material_save($in)
{
    require_super();
    $id = in_str($in, 'id', 32, '');
    $name = trim(in_str($in, 'name', 100, ''));
    $categoryId = in_str($in, 'categoryId', 32);
    if ($name === '') throw new ApiException('请填写原物料名称');
    if (mb_strlen($name) > 40) throw new ApiException('原物料名称不能超过 40 个字');
    if (!expiry_category_row($categoryId)) throw new ApiException('请选择所属分类');
    /* 默认规则/默认时长/默认到期时间已从表单移除：保留库中历史值，不再读写 */
    $sortOrder = isset($in['sortOrder']) ? (int)$in['sortOrder'] : 0;
    $enabled = !isset($in['enabled']) || $in['enabled'] !== false;
    $closeDue = !empty($in['closeDue']);
    $remark = mb_substr(isset($in['remark']) ? (string)$in['remark'] : '', 0, 200);
    $st = db()->prepare('SELECT id FROM expiry_materials WHERE category_id=? AND name=? AND id<>?');
    $st->execute(array($categoryId, $name, $id));
    if ($st->fetchColumn()) throw new ApiException('该分类下已存在同名原物料');

    if ($id !== '') {
        $old = expiry_material_row($id);
        if (!$old) throw new ApiException('原物料不存在', 'NOT_FOUND', 404);
        $st = db()->prepare('UPDATE expiry_materials SET category_id=?, name=?, close_due=?, sort_order=?, enabled=?, remark=?, updated_at=? WHERE id=?');
        $st->execute(array($categoryId, $name, $closeDue ? 1 : 0, $sortOrder, $enabled ? 1 : 0, $remark, now_dt(), $id));
        audit_log('修改效期原物料', $name, '');
    } else {
        $id = expiry_uid('EM');
        /* 三个默认字段使用表默认值（time / 0 / ''），不再显式写入 */
        $st = db()->prepare('INSERT INTO expiry_materials (id, category_id, name, close_due, sort_order, enabled, remark, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
        $st->execute(array($id, $categoryId, $name, $closeDue ? 1 : 0, $sortOrder, $enabled ? 1 : 0, $remark, now_dt(), now_dt()));
        audit_log('新增效期原物料', $name, '');
    }
    return array('id' => $id);
}

function api_expiry_material_bulk($in)
{
    require_super();
    $ids = isset($in['ids']) && is_array($in['ids']) ? array_values(array_filter(array_map('strval', $in['ids']))) : array();
    if (!$ids) throw new ApiException('请选择原物料');
    $categoryId = in_str($in, 'categoryId', 32, '');
    $hasEnabled = array_key_exists('enabled', $in);
    if ($categoryId === '' && !$hasEnabled) throw new ApiException('请选择批量操作');
    if ($categoryId !== '' && !expiry_category_row($categoryId)) throw new ApiException('分类不存在');
    $sets = array();
    $vals = array();
    if ($hasEnabled) { $sets[] = 'enabled=?'; $vals[] = !empty($in['enabled']) ? 1 : 0; }
    if ($categoryId !== '') { $sets[] = 'category_id=?'; $vals[] = $categoryId; }
    $sets[] = 'updated_at=?';
    $vals[] = now_dt();
    $sql = 'UPDATE expiry_materials SET ' . implode(', ', $sets) . ' WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
    $params = array_merge($vals, $ids);
    $st = db()->prepare($sql);
    $st->execute($params);
    $count = $st->rowCount();
    audit_log('批量维护效期原物料', $count . ' 项', $hasEnabled ? (!empty($in['enabled']) ? '启用' : '停用') : '调整分类');
    return array('updated' => $count);
}

function api_expiry_check_data($in)
{
    require_login();
    $date = in_str($in, 'date', 10, today_d());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');
    $records = array();
    $st = db()->prepare('SELECT * FROM expiry_records WHERE check_date = ?');
    $st->execute(array($date));
    foreach ($st->fetchAll() as $r) $records[$r['material_id']] = expiry_record_out($r);

    $categories = array();
    $catRows = db()->query('SELECT * FROM expiry_categories WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
    $matRows = db()->query('SELECT * FROM expiry_materials WHERE enabled = 1 ORDER BY sort_order ASC, name ASC')->fetchAll();
    foreach ($catRows as $c) {
        $mats = array();
        foreach ($matRows as $m) {
            if ($m['category_id'] !== $c['id']) continue;
            $item = expiry_material_out($m);
            $item['record'] = isset($records[$m['id']]) ? $records[$m['id']] : null;
            $mats[] = $item;
        }
        if (!$mats) continue;
        $cat = expiry_category_out($c);
        $cat['materials'] = $mats;
        $categories[] = $cat;
    }
    return array('date' => $date, 'closeTime' => expiry_close_time(), 'categories' => $categories);
}

function api_expiry_check_save($in)
{
    $acc = require_login();
    $date = in_str($in, 'date', 10, today_d());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');
    $items = isset($in['items']) && is_array($in['items']) ? $in['items'] : array();
    if (!$items) throw new ApiException('请至少填写一项产品效期');

    $saved = 0;
    $seen = array();
    $prepared = array();
    $expired = array();
    $nowTs = time();
    foreach ($items as $it) {
        $mid = isset($it['materialId']) ? (string)$it['materialId'] : '';
        if ($mid === '' || isset($seen[$mid])) continue;
        $seen[$mid] = true;
        $m = expiry_material_row($mid);
        if (!$m) throw new ApiException('原物料不存在');
        if (!(int)$m['enabled']) throw new ApiException('原物料「' . $m['name'] . '」已停用');
        if ((int)$m['close_due']) {
            /* 打烊到期：只选日期，时间取门店打烊时刻（以提交时的最新配置为准） */
            $day = substr((string)(isset($it['dueAt']) ? $it['dueAt'] : ''), 0, 10);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) throw new ApiException('请选择「' . $m['name'] . '」的到期日期');
            $dueAt = $day . ' ' . expiry_close_time();
        } else {
            $dueAt = dt_in(isset($it['dueAt']) ? $it['dueAt'] : '');
        }
        if (!$dueAt) throw new ApiException('请填写「' . $m['name'] . '」的到期时间');
        $scrap = !empty($it['scrap']);
        /* 已过期必须显式确认报废，避免静默提交；按门店时区的真实时间戳比较 */
        $dueTs = strtotime($dueAt);
        if ($dueTs !== false && $dueTs <= $nowTs && !$scrap) {
            $expired[] = $m['name'] . '（' . $dueAt . '）';
            continue;
        }
        $cat = expiry_category_row($m['category_id']);
        $prepared[] = array(
            'mid' => $mid, 'm' => $m, 'cat' => $cat, 'dueAt' => $dueAt,
            'note' => mb_substr(isset($it['note']) ? (string)$it['note'] : '', 0, 200),
            'scrap' => $scrap
        );
    }
    if ($expired) throw new ApiException('该效期已过期，请按报废流程处理：' . implode('、', $expired));

    foreach ($prepared as $p) {
        $m = $p['m'];
        $cat = $p['cat'];
        $status = $p['scrap'] ? 'scrapped' : 'normal';
        $scrapBy = $p['scrap'] ? $acc['name'] : '';
        $scrapAt = $p['scrap'] ? now_dt() : null;
        /* 同一物料同一天重复登记：覆盖旧值并重置状态，变更通过操作日志追溯 */
        $st = db()->prepare('INSERT INTO expiry_records (id, material_id, category_id, material_name, category_name, check_date, due_at, note, status, processed_by, processed_at, created_by, created_at, updated_by, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE category_id=VALUES(category_id), material_name=VALUES(material_name), category_name=VALUES(category_name),
            due_at=VALUES(due_at), note=VALUES(note), status=VALUES(status), processed_by=VALUES(processed_by),
            processed_at=VALUES(processed_at), updated_by=VALUES(updated_by), updated_at=VALUES(updated_at)');
        $st->execute(array(
            expiry_uid('ER'), $p['mid'], $m['category_id'], $m['name'], $cat ? $cat['name'] : '',
            $date, $p['dueAt'], $p['note'], $status, $scrapBy, $scrapAt, $acc['name'], now_dt(), $acc['name'], now_dt()
        ));
        $saved++;
    }
    audit_log('提交效期检查', $date, '登记 ' . $saved . ' 项');
    return array('ok' => true, 'saved' => $saved, 'date' => $date);
}

function api_expiry_due_list($in)
{
    require_login();
    $date = in_str($in, 'date', 10, today_d());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');
    $st = db()->prepare('SELECT * FROM expiry_records WHERE DATE(due_at) = ? AND check_date = DATE_SUB(?, INTERVAL 1 DAY) ORDER BY due_at ASC');
    $st->execute(array($date, $date));
    $list = array();
    foreach ($st->fetchAll() as $r) $list[] = expiry_record_out($r);
    return array('date' => $date, 'list' => $list);
}

function api_expiry_day_list($in)
{
    require_login();
    $date = in_str($in, 'date', 10, today_d());
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) throw new ApiException('请选择有效日期');
    $st = db()->prepare('SELECT * FROM expiry_records WHERE check_date = ? AND due_at IS NOT NULL ORDER BY due_at ASC');
    $st->execute(array($date));
    $list = array();
    foreach ($st->fetchAll() as $r) $list[] = expiry_record_out($r);
    return array('date' => $date, 'list' => $list);
}

function api_expiry_process($in)
{
    $acc = require_login();
    $id = in_str($in, 'id', 32);
    $row = expiry_record_row($id);
    if (!$row) throw new ApiException('效期记录不存在', 'NOT_FOUND', 404);
    if ($row['status'] !== 'processed') {
        $st = db()->prepare('UPDATE expiry_records SET status=\'processed\', processed_by=?, processed_at=?, updated_by=?, updated_at=? WHERE id=?');
        $st->execute(array($acc['name'], now_dt(), $acc['name'], now_dt(), $id));
        audit_log('效期已处理', $row['material_name'], $row['check_date'] . ' · ' . $row['due_at']);
    }
    return array('ok' => true, 'record' => expiry_record_out(expiry_record_row($id)));
}
