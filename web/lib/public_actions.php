<?php
/* public_actions.php — 免登录公开只读接口（健康证公示、公告、站点标题） */

/* 站点标题（免登录）：所有页面据此统一浏览器标签文字 */
function api_public_site_title($in)
{
    header('Cache-Control: no-store');
    return array('ok' => true, 'siteTitle' => site_title());
}

function health_mask_name($name)
{
    $name = trim((string)$name);
    if ($name === '') return '';
    $first = function_exists('mb_substr') ? mb_substr($name, 0, 1, 'UTF-8') : substr($name, 0, 1);
    return $first . '*';
}

function health_public_cache_file()
{
    return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'trae_health_v5_' . md5(APP_ROOT) . '.json';
}

/**
 * 公示页只取「当前证件」的最近一次核验结论、日期与材料登记信息；
 * 不返回核验人姓名与备注。
 */
function health_public_verify($staffId, $certKey)
{
    if ($certKey === '') return null;
    $st = db()->prepare('SELECT result, verified_at, material_key, material_name FROM health_cert_verifications WHERE staff_id = ? AND cert_key = ? ORDER BY verified_at DESC, created_at DESC, id DESC LIMIT 1');
    $st->execute(array($staffId, $certKey));
    $r = $st->fetch();
    return $r ? $r : null;
}

/** 核验材料类型：仅图片与 PDF 对外可见，其余按无材料处理 */
function health_public_material_kind($key)
{
    $ext = strtolower(pathinfo((string)$key, PATHINFO_EXTENSION));
    if ($ext === 'pdf') return 'pdf';
    if (in_array($ext, array('jpg', 'jpeg', 'png', 'webp'), true)) return 'image';
    return '';
}

/**
 * 健康证公示数据（免登录）。
 * 只下发：门店、姓名（默认脱敏）、岗位、健康证有效期与状态；
 * 身份证号、证件照片、手机号等一律不返回。
 * 结果缓存 60 秒，避免被反复拉取。
 */
/* 公告独立公开页：仅已发布且已到发布时间的通知可访问 */
function api_public_notice($in)
{
    $id = in_str($in, 'id', 24);
    if ($id === '') throw new ApiException('公告不存在或已下线', 'NOT_FOUND', 404);
    /* 定时公告到点后由任意访问惰性转为已发布（与员工端一致，不依赖 cron） */
    if (function_exists('notice_activate_due')) {
        try { notice_activate_due(); } catch (Exception $e) { /* 忽略：不影响读取 */ }
    }
    $st = db()->prepare("SELECT * FROM notices WHERE id = ? AND status = 'published' AND (publish_at IS NULL OR publish_at <= ?)");
    $st->execute(array($id, now_dt()));
    $r = $st->fetch();
    if (!$r) throw new ApiException('公告不存在或已下线', 'NOT_FOUND', 404);
    return array(
        'ok' => true,
        'id' => (string)$r['id'],
        'category' => notice_category_norm($r['category']),
        'title' => (string)$r['title'],
        'body' => (string)$r['body'],
        'publisher' => (string)$r['publisher'],
        'publishedAt' => $r['published_at'] ? iso($r['published_at']) : '',
        'important' => !empty($r['important']),
        'pinned' => !empty($r['pinned']),
        'shareUrl' => app_public_url('notice.html?id=' . rawurlencode((string)$r['id']))
    );
}

function api_public_health_list($in)
{
    $cfg = settings_data();
    $hd = isset($cfg['healthDisclosure']) ? $cfg['healthDisclosure'] : array('enabled' => false, 'fullName' => false);
    $enabled = !empty($hd['enabled']);
    if (!$enabled) {
        header('Cache-Control: no-store');
        return array('enabled' => false, 'message' => '公示已关闭');
    }

    $fullName = !empty($hd['fullName']);
    $cacheFile = health_public_cache_file();
    if (is_file($cacheFile) && (time() - (int)@filemtime($cacheFile)) < 60) {
        $raw = @file_get_contents($cacheFile);
        $cached = $raw ? json_decode($raw, true) : null;
        if (is_array($cached) && isset($cached['enabled'])) {
            header('Cache-Control: public, max-age=60');
            return $cached;
        }
    }

    $today = today_d();
    $threshold = (int)$cfg['expiry']['healthCert'];
    /* 超级管理员（店长本人）不参与公示统计与列表 */
    $st = db()->prepare("SELECT id, name, position, health_cert_expiry, files_json, updated_at FROM staff WHERE status = 'active' AND health_cert_expiry IS NOT NULL AND id NOT IN (SELECT staff_id FROM accounts WHERE role = 'superadmin') ORDER BY name");
    $st->execute();

    $items = array();
    $counts = array('valid' => 0, 'soon' => 0, 'expired' => 0, 'verified' => 0, 'rejected' => 0, 'unverified' => 0);
    $updatedAt = '';
    foreach ($st->fetchAll() as $r) {
        $days = diff_days($r['health_cert_expiry'], $today);
        if ($days < 0) {
            $state = 'expired';
        } elseif ($days <= $threshold) {
            $state = 'soon';
        } else {
            $state = 'valid';
        }
        $counts[$state]++;
        $files = json_field($r['files_json'], array());
        $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
        $verify = health_public_verify($r['id'], $certKey);
        $verifyStatus = $verify ? $verify['result'] : 'none';
        if ($verifyStatus === 'pass') $counts['verified']++;
        elseif ($verifyStatus === 'reject') $counts['rejected']++;
        else $counts['unverified']++;
        $materialKind = $verify ? health_public_material_kind($verify['material_key']) : '';
        $items[] = array(
            'staffId' => $r['id'],
            'name' => $fullName ? $r['name'] : health_mask_name($r['name']),
            'position' => normalize_position($r['position']),
            'expiry' => $r['health_cert_expiry'],
            'days' => $days,
            'state' => $state,
            'hasFile' => $certKey !== '' && strtolower(pathinfo($certKey, PATHINFO_EXTENSION)) === 'pdf',
            /* 公示口径：只给结论与日期 */
            'verifyStatus' => $verifyStatus,
            'verifyDate' => $verify ? substr((string)$verify['verified_at'], 0, 10) : '',
            /* 只下发材料类型与名称，不含文件 key；读取走 public.healthMaterial */
            'material' => $materialKind !== '' ? array(
                'name' => $verify['material_name'] !== '' ? $verify['material_name'] : ($materialKind === 'pdf' ? '核验材料.pdf' : '核验材料图片'),
                'kind' => $materialKind
            ) : null
        );
        if ($r['updated_at'] && $r['updated_at'] > $updatedAt) $updatedAt = $r['updated_at'];
    }

    $info = store_info();
    $data = array(
        'enabled' => true,
        'fullName' => $fullName,
        'thresholdDays' => $threshold,
        'stores' => array(array(
            'code' => $info['code'],
            'name' => $info['name'],
            'shortName' => $info['shortName'],
            'items' => $items
        )),
        'counts' => array(
            'valid' => $counts['valid'],
            'soon' => $counts['soon'],
            'expired' => $counts['expired'],
            'verified' => $counts['verified'],
            'rejected' => $counts['rejected'],
            'unverified' => $counts['unverified'],
            'total' => count($items)
        ),
        'generatedAt' => iso(now_dt()),
        'updatedAt' => $updatedAt ? iso($updatedAt) : iso(now_dt()),
        'source' => '门店人员档案（健康证登记）'
    );

    @file_put_contents($cacheFile, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
    header('Cache-Control: public, max-age=60');
    return $data;
}

/**
 * 健康证 PDF（免登录只读）。
 * 仅接受员工 ID：服务端校验公示开关、员工在职、文件确为该员工健康证且为 PDF；
 * 路径必须落在 uploads 目录内，拒绝目录穿越；任何异常统一 404，不泄露文件是否存在。
 */
function api_public_health_file($in)
{
    $cfg = settings_data();
    $hd = isset($cfg['healthDisclosure']) ? $cfg['healthDisclosure'] : array('enabled' => false);
    if (empty($hd['enabled'])) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $sid = isset($in['staffId']) ? (string)$in['staffId'] : '';
    if (!preg_match('/^[A-Za-z0-9\-]{1,16}$/', $sid)) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $st = db()->prepare("SELECT id, files_json FROM staff WHERE id = ? AND status = 'active' AND id NOT IN (SELECT staff_id FROM accounts WHERE role = 'superadmin')");
    $st->execute(array($sid));
    $staff = $st->fetch();
    if (!$staff) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $files = json_field($staff['files_json'], array());
    $key = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
    if ($key === '' || !preg_match('#^\d{4}/\d{2}/[A-Za-z0-9_\-]+\.pdf$#i', $key)) {
        throw new ApiException('文件不可用', 'NOT_FOUND', 404);
    }

    $base = realpath(APP_ROOT . '/uploads');
    $path = realpath(APP_ROOT . '/uploads/' . $key);
    if (!$base || !$path || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) {
        throw new ApiException('文件不可用', 'NOT_FOUND', 404);
    }
    if (strtolower(pathinfo($path, PATHINFO_EXTENSION)) !== 'pdf') {
        throw new ApiException('文件不可用', 'NOT_FOUND', 404);
    }
    $fh = @fopen($path, 'rb');
    $head = $fh ? (string)fread($fh, 5) : '';
    if ($fh) fclose($fh);
    if ($head !== '%PDF-') throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    header('Content-Type: application/pdf');
    header('Content-Disposition: inline; filename="health-certificate.pdf"');
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=60');
    readfile($path);
    exit;
}

/**
 * 核验材料（免登录只读，图片/PDF）。
 * 安全约束与 public.healthFile 一致：
 * - 公示开关关闭时一律不可读；
 * - 仅接受员工 ID，且员工须在职、非店长本人；
 * - 只允许读取该员工「当前证件最近一次核验」登记过的材料 key，不接受任意 key；
 * - key 必须形如 YYYY/MM/文件名，realpath 必须落在 uploads 内；
 * - 扩展名与文件头双重校验；任何异常统一返回同样的 404 文案。
 */
function api_public_health_material($in)
{
    $cfg = settings_data();
    $hd = isset($cfg['healthDisclosure']) ? $cfg['healthDisclosure'] : array('enabled' => false);
    if (empty($hd['enabled'])) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $sid = isset($in['staffId']) ? (string)$in['staffId'] : '';
    if (!preg_match('/^[A-Za-z0-9\-]{1,16}$/', $sid)) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $st = db()->prepare("SELECT id, files_json FROM staff WHERE id = ? AND status = 'active' AND id NOT IN (SELECT staff_id FROM accounts WHERE role = 'superadmin')");
    $st->execute(array($sid));
    $staff = $st->fetch();
    if (!$staff) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $files = json_field($staff['files_json'], array());
    $certKey = isset($files['healthCert']) ? (string)$files['healthCert'] : '';
    if ($certKey === '') throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    /* 只取与当前证件一致、且登记了材料的最近一条核验 */
    $st = db()->prepare("SELECT material_key FROM health_cert_verifications WHERE staff_id = ? AND cert_key = ? AND material_key <> '' ORDER BY verified_at DESC, created_at DESC, id DESC LIMIT 1");
    $st->execute(array($sid, $certKey));
    $row = $st->fetch();
    if (!$row) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $key = (string)$row['material_key'];
    if (!preg_match('#^\d{4}/\d{2}/[A-Za-z0-9_\-]+\.(pdf|jpg|jpeg|png|webp)$#i', $key)) {
        throw new ApiException('文件不可用', 'NOT_FOUND', 404);
    }
    $kind = health_public_material_kind($key);
    if ($kind === '') throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $base = realpath(APP_ROOT . '/uploads');
    $path = realpath(APP_ROOT . '/uploads/' . $key);
    if (!$base || !$path || strpos($path, $base . DIRECTORY_SEPARATOR) !== 0 || !is_file($path)) {
        throw new ApiException('文件不可用', 'NOT_FOUND', 404);
    }
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $allowedExt = $kind === 'pdf' ? array('pdf') : array('jpg', 'jpeg', 'png', 'webp');
    if (!in_array($ext, $allowedExt, true)) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $fh = @fopen($path, 'rb');
    $head = $fh ? (string)fread($fh, 12) : '';
    if ($fh) fclose($fh);
    $mimeMap = array('pdf' => 'application/pdf', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp');
    $ok = false;
    if ($ext === 'pdf') {
        $ok = (substr($head, 0, 5) === '%PDF-');
    } elseif ($ext === 'jpg' || $ext === 'jpeg') {
        $ok = (substr($head, 0, 3) === "\xFF\xD8\xFF");
    } elseif ($ext === 'png') {
        $ok = (substr($head, 0, 8) === "\x89PNG\r\n\x1A\n");
    } elseif ($ext === 'webp') {
        $ok = (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP');
    }
    if (!$ok) throw new ApiException('文件不可用', 'NOT_FOUND', 404);

    $filename = 'health-verify-material.' . $ext;
    header('Content-Type: ' . $mimeMap[$ext]);
    header('Content-Disposition: inline; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($path));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=60');
    readfile($path);
    exit;
}
