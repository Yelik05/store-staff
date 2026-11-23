<?php
/* file_actions.php — 附件上传（服务器 uploads 目录）与元信息 */

/**
 * 探测上传文件的真实类型。
 * 优先使用 fileinfo 扩展；主机未开启 fileinfo 时自动降级为文件头魔数校验。
 * 注意：不使用 $_FILES['type']，因为该值由客户端提交，可被伪造。
 *
 * @return string 识别出的 MIME，识别失败返回空字符串
 */
function upload_mime_probe($path)
{
    if (class_exists('finfo')) {
        $finfo = @new finfo(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = (string)@$finfo->file($path);
            if (in_array($mime, array('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'), true)) {
                return $mime;
            }
        }
    }
    $fh = @fopen($path, 'rb');
    if (!$fh) return '';
    $head = (string)fread($fh, 12);
    fclose($fh);
    if (substr($head, 0, 3) === "\xFF\xD8\xFF") return 'image/jpeg';
    if (substr($head, 0, 8) === "\x89PNG\r\n\x1A\n") return 'image/png';
    if (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') return 'image/webp';
    if (substr($head, 0, 6) === 'GIF87a' || substr($head, 0, 6) === 'GIF89a') return 'image/gif';
    if (substr($head, 0, 4) === '%PDF') return 'application/pdf';
    return '';
}

function api_file_upload($in)
{
    app_session_start();
    $acc = current_account();
    if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
        throw new ApiException('请选择文件');
    }
    $f = $_FILES['file'];
    if (!empty($f['error'])) {
        if ((int)$f['error'] === UPLOAD_ERR_INI_SIZE || (int)$f['error'] === UPLOAD_ERR_FORM_SIZE) {
            throw new ApiException('文件超过服务器允许的上传大小，请联系店长调整 upload_max_filesize');
        }
        throw new ApiException('文件上传失败，请重试');
    }
    if (!is_uploaded_file($f['tmp_name'])) throw new ApiException('文件上传失败，请重试');
    $type = isset($in['type']) ? (string)$in['type'] : 'idFront';
    $name = isset($f['name']) ? basename((string)$f['name']) : 'file';
    $size = (int)$f['size'];
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if ($ext === 'jpeg') $ext = 'jpg';

    $mime = upload_mime_probe($f['tmp_name']);

    if ($type === 'reimburse' || $type === 'healthVerify') {
        /* 报销附件 / 核验材料：图片或 PDF，单个不超过 10MB */
        $label = $type === 'healthVerify' ? '核验材料' : '报销附件';
        $allow = array('jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'pdf' => 'application/pdf');
        if (!isset($allow[$ext]) || $mime !== $allow[$ext]) {
            throw new ApiException($label . '支持 JPG、PNG、WEBP 或 PDF');
        }
        if ($size > 10 * 1024 * 1024) throw new ApiException($label . '单个不能超过 10MB');
        if ($ext !== 'pdf') {
            $info = @getimagesize($f['tmp_name']);
            if (!$info || (defined('IMAGETYPE_WEBP') && $info[2] === IMAGETYPE_WEBP && $mime !== 'image/webp')) {
                throw new ApiException('图片文件无法识别，请重新选择');
            }
            $typeMap = array(IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png');
            if (defined('IMAGETYPE_WEBP')) $typeMap[IMAGETYPE_WEBP] = 'image/webp';
            if (!isset($typeMap[$info[2]]) || $typeMap[$info[2]] !== $mime) {
                throw new ApiException('图片格式与扩展名不一致，请重新选择');
            }
        }
    } elseif ($type === 'healthCert') {
        if ($ext !== 'pdf' || $mime !== 'application/pdf') {
            throw new ApiException('健康证需为 PDF 文件且不超过 10MB');
        }
        if ($size > 10 * 1024 * 1024) throw new ApiException('健康证需为 PDF 文件且不超过 10MB');
    } else {
        /* 身份证正反面、白底一寸照：支持常见图片格式，体积上限放宽（证件 20MB / 照片 10MB） */
        $extMime = array('jpg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif');
        if (!isset($extMime[$ext]) || !in_array($mime, array_values($extMime), true)) {
            throw new ApiException('图片格式不符合要求，请上传 JPG、PNG、WEBP 或 GIF');
        }
        $limit = $type === 'photo' ? 10 : 20;
        if ($size > $limit * 1024 * 1024) {
            throw new ApiException('图片大小超过限制，' . ($type === 'photo' ? '照片' : '证件') . '不超过 ' . $limit . 'MB');
        }
        /* 再校验一次图片结构，确保文件头、扩展名与真实图像类型三者一致 */
        $info = @getimagesize($f['tmp_name']);
        $typeMap = array(IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_GIF => 'image/gif');
        if (defined('IMAGETYPE_WEBP')) $typeMap[IMAGETYPE_WEBP] = 'image/webp';
        if (!$info || !isset($typeMap[$info[2]])) {
            throw new ApiException('图片文件无法识别，请重新选择');
        }
        $want = $typeMap[$info[2]];
        if ($want !== $mime || $extMime[$ext] !== $mime) {
            throw new ApiException('图片格式与扩展名不一致，请重新选择');
        }
    }

    $dir = APP_ROOT . '/uploads/' . date('Y') . '/' . date('m');
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        throw new ApiException('上传目录不可写，请检查 uploads 目录权限', 'UPLOAD_DIR', 500);
    }
    if (!is_writable($dir)) throw new ApiException('上传目录不可写，请检查 uploads 目录权限', 'UPLOAD_DIR', 500);

    $random = function_exists('random_bytes') ? bin2hex(random_bytes(8)) : md5(uniqid('', true));
    $filename = date('Ymd') . '_' . $random . '.' . $ext;
    $target = $dir . '/' . $filename;
    if (!@move_uploaded_file($f['tmp_name'], $target)) {
        throw new ApiException('文件保存失败，请检查目录权限', 'UPLOAD_FAIL', 500);
    }
    @chmod($target, 0644);

    $key = date('Y') . '/' . date('m') . '/' . $filename;
    $st = db()->prepare('INSERT INTO files (file_key, original_name, mime, size, uploaded_by, created_at) VALUES (?,?,?,?,?,?)');
    $st->execute(array(
        $key, str_limit($name, 160), $mime, $size,
        $acc ? $acc['staff_id'] : null, now_dt()
    ));
    if ($acc) audit_log('上传附件', $acc['name'], $name);

    return array(
        'key' => $key,
        'url' => 'uploads/' . $key,
        'name' => $name,
        'size' => $size,
        'type' => $mime
    );
}

function api_file_meta($in)
{
    $key = isset($in['key']) ? (string)$in['key'] : '';
    if ($key === '') return null;
    $st = db()->prepare('SELECT * FROM files WHERE file_key = ?');
    $st->execute(array($key));
    $f = $st->fetch();
    if (!$f) return null;
    return array(
        'key' => $f['file_key'],
        'name' => $f['original_name'],
        'size' => (int)$f['size'],
        'type' => $f['mime']
    );
}
