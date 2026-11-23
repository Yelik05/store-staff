<?php
/* api.php — REST 风格单入口：POST api.php?action=xxx */

@ini_set('display_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/lib/bootstrap.php';

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: same-origin');

try {
    if (!isset($_SERVER['REQUEST_METHOD']) || strtoupper($_SERVER['REQUEST_METHOD']) !== 'POST') {
        throw new ApiException('请使用 POST 请求接口', 'METHOD_NOT_ALLOWED', 405);
    }
    require_once __DIR__ . '/lib/api_routes.php';
    $action = isset($_GET['action']) ? (string)$_GET['action'] : '';
    if ($action === '') throw new ApiException('缺少 action 参数', 'BAD_REQUEST', 400);
    $input = read_input();
    $data = api_dispatch($action, $input);
    json_out(array('ok' => true, 'data' => $data));
} catch (ApiException $e) {
    $payload = array('ok' => false, 'error' => $e->getMessage());
    if ($e->apiCode) $payload['code'] = $e->apiCode;
    foreach ($e->extra as $k => $v) $payload[$k] = $v;
    json_out($payload, $e->httpStatus);
} catch (Throwable $e) {
    error_log('API fatal: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_out(array('ok' => false, 'error' => '服务器内部错误，请稍后重试', 'code' => 'SERVER_ERROR'), 500);
}
