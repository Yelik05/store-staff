<?php
/* diag-date.php — 导入日期/月份校验自检页（临时诊断用，排查完成后请删除本文件）
 * 访问方式：/diag-date.php?token=diag-202611287
 * 本页直接调用导入使用的 attendance_norm_date_trace / salary_import_month_trace，
 * 不复制校验逻辑，因此结果与真实导入完全一致。
 */
header('Content-Type: text/html; charset=utf-8');

$token = isset($_GET['token']) ? (string)$_GET['token'] : '';
if (!hash_equals('diag-202611287', $token)) {
    http_response_code(403);
    echo '<meta charset="utf-8"><p>403 Forbidden。请使用 <code>?token=diag-202611287</code> 访问。</p>';
    exit;
}

require __DIR__ . '/lib/attendance_actions.php';
require __DIR__ . '/lib/salary_actions.php';

$warnings = array();
set_error_handler(function ($no, $str) use (&$warnings) { $warnings[] = $str; return true; });

function d_export($v)
{
    if (is_string($v)) return '"' . $v . '"';
    if ($v === null) return 'null';
    if (is_bool($v)) return $v ? 'true' : 'false';
    return (string)$v;
}
function d_preg_err()
{
    if (function_exists('preg_last_error_msg')) return preg_last_error_msg();
    $map = array(0 => 'PREG_NO_ERROR', 1 => 'PREG_INTERNAL_ERROR', 2 => 'PREG_BACKTRACK_LIMIT_ERROR', 3 => 'PREG_RECURSION_LIMIT_ERROR', 4 => 'PREG_BAD_UTF8_ERROR', 5 => 'PREG_BAD_UTF8_OFFSET_ERROR', 6 => 'PREG_JIT_STACKLIMIT_ERROR');
    $e = preg_last_error();
    return isset($map[$e]) ? $map[$e] : ('ERR#' . $e);
}

$dates = array('2026-11-02', '2026-11-02 00:00:00', '2026-11-02T00:00:00.000Z', 46300, '46300', "\xEF\xBB\xBF2026-11-02", "2026-11-02\xC2\xA0", "２０２６-１１-０２", '', null);
$months = array('2026-10', '2026-10-01', '2026/10', '2026年10月', 46300, '', null);

$oldPattern = '/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/';
$rowSample = array('date' => '2026-11-02', 'workDate' => '2026-11-02', 'empNo' => 'NO1007782', 'name' => '陈旺');
$rowMerged = attendance_import_row($rowSample);

?><!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>导入日期校验自检</title>
<style>
body{font:13px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;padding:22px;color:#1f2329;background:#f6f7f9}
h1{font-size:20px;margin:0 0 12px}
h2{font-size:15px;margin:22px 0 8px}
table{width:100%;border-collapse:collapse;background:#fff;font-size:12px}
th,td{border:1px solid #e6e8eb;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f0f3f7;font-weight:600}
.mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.pass{color:#1a7f37;font-weight:600}
.fail{color:#c8102e;font-weight:600}
.warn{background:#fff7e6;border:1px solid #ffd591;padding:10px 12px;border-radius:8px;margin-bottom:14px}
code{background:#eef2f7;padding:1px 5px;border-radius:4px}
pre{background:#0f172a;color:#e2e8f0;padding:10px;border-radius:8px;overflow:auto}
</style>
</head>
<body>
<h1>导入日期校验自检</h1>
<div class="warn">本页为临时诊断文件，排查完成后请立即删除 <code>diag-date.php</code>，避免暴露服务器信息。</div>

<h2>环境</h2>
<table>
<tr><th style="width:220px">PHP_VERSION</th><td class="mono"><?php echo htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>date_default_timezone_get()</th><td class="mono"><?php echo htmlspecialchars(date_default_timezone_get(), ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>当前校验用正则（attendance_date_pattern）</th><td class="mono"><?php echo htmlspecialchars(attendance_date_pattern(), ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>旧的错误正则</th><td class="mono"><?php echo htmlspecialchars($oldPattern, ENT_QUOTES, 'UTF-8'); ?></td></tr>
</table>

<h2>旧正则为什么必然失败（真实 PHP preg 行为）</h2>
<?php
$oldResult = @preg_match($oldPattern, '2026-11-02', $om);
$oldWarnings = $warnings; $warnings = array();
?>
<table>
<tr><th style="width:220px">preg_match 返回值</th><td class="mono"><?php echo var_export($oldResult, true); ?> <?php echo $oldResult === false ? '<span class="fail">（false：模式本身无效，任何日期都判不过）</span>' : ''; ?></td></tr>
<tr><th>preg_last_error</th><td class="mono"><?php echo htmlspecialchars(d_preg_err(), ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>PHP 警告</th><td class="mono"><?php echo htmlspecialchars(implode(' | ', $oldWarnings), ENT_QUOTES, 'UTF-8'); ?></td></tr>
</table>

<h2>日期逐值校验（直接调用导入函数 attendance_norm_date_trace）</h2>
<table>
<thead><tr><th>原始值</th><th>trim 后</th><th>全角归一后</th><th>数值分支</th><th>正则匹配</th><th>匹配结果</th><th>checkdate</th><th>最终结果</th></tr></thead>
<tbody>
<?php foreach ($dates as $v) {
    $t = attendance_norm_date_trace($v);
    $ok = $t['result'] !== '';
    echo '<tr>';
    echo '<td class="mono">' . htmlspecialchars(d_export($v), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(d_export($t['trimmed']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(d_export($t['normalized']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . htmlspecialchars($t['numeric'] === '' ? '—' : $t['numeric'], ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . ($t['regex_ok'] ? 'true' : 'false') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(json_encode($t['regex_match'], JSON_UNESCAPED_UNICODE), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . ($t['checkdate'] === null ? '—' : ($t['checkdate'] ? 'true' : 'false')) . '</td>';
    echo '<td class="mono ' . ($ok ? 'pass' : 'fail') . '">' . htmlspecialchars(d_export($t['result']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '</tr>';
} ?>
</tbody>
</table>

<h2>薪资月份逐值校验（salary_import_month_trace）</h2>
<table>
<thead><tr><th>原始值</th><th>trim 后</th><th>全角归一后</th><th>正则匹配</th><th>匹配结果</th><th>最终结果</th></tr></thead>
<tbody>
<?php foreach ($months as $v) {
    $t = salary_import_month_trace($v);
    $ok = $t['result'] !== '';
    echo '<tr>';
    echo '<td class="mono">' . htmlspecialchars(d_export($v), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(d_export($t['trimmed']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(d_export($t['normalized']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono">' . ($t['regex_ok'] ? 'true' : 'false') . '</td>';
    echo '<td class="mono">' . htmlspecialchars(json_encode($t['regex_match'], JSON_UNESCAPED_UNICODE), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '<td class="mono ' . ($ok ? 'pass' : 'fail') . '">' . htmlspecialchars(d_export($t['result']), ENT_QUOTES, 'UTF-8') . '</td>';
    echo '</tr>';
} ?>
</tbody>
</table>

<h2>字段归一与键名检查（attendance_import_row）</h2>
<table>
<tr><th style="width:220px">传入行</th><td class="mono"><?php echo htmlspecialchars(json_encode($rowSample, JSON_UNESCAPED_UNICODE), ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>归一后 date</th><td class="mono"><?php echo htmlspecialchars(d_export(isset($rowMerged['date']) ? $rowMerged['date'] : null), ENT_QUOTES, 'UTF-8'); ?></td></tr>
<tr><th>date 是否存在</th><td class="mono"><?php echo array_key_exists('date', $rowMerged) ? 'true' : 'false'; ?></td></tr>
<tr><th>归一后 date 的校验结果</th><td class="mono <?php echo attendance_norm_date(isset($rowMerged['date']) ? $rowMerged['date'] : '') !== '' ? 'pass' : 'fail'; ?>"><?php echo htmlspecialchars(d_export(attendance_norm_date(isset($rowMerged['date']) ? $rowMerged['date'] : '')), ENT_QUOTES, 'UTF-8'); ?></td></tr>
</table>

<p style="margin-top:18px;color:#5c6370">结论判断：若「旧正则」返回 false，而「日期逐值校验」中 <code>2026-11-02</code> 最终结果为 <code>"2026-11-02"</code>，说明本次修复已生效；修复前正是旧正则使 <code>preg_match</code> 恒返回 false，导致所有日期被判为无效。</p>
</body>
</html>
