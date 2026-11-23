<?php
/* token_auth.php — App 专用 Token 鉴权
 *
 * 设计原则：
 * 1. 与网页 Session 完全并存：只有请求头带 X-App-Token 时才走 Token；
 *    网页请求不带该头，行为与原来一致。
 * 2. 数据库只存 token 的 sha256 摘要，泄露库也拿不到明文。
 * 3. 失效统一返回 401 + code：TOKEN_INVALID / TOKEN_EXPIRED / TOKEN_REVOKED；
 *    账号停用返回 403 + DISABLED。
 */

function app_token_ttl_seconds()
{
    return 30 * 86400; /* 30 天；App 可在到期前调用 auth.appRefresh 续期换新 */
}

function app_token_header_value()
{
    $v = '';
    if (!empty($_SERVER['HTTP_X_APP_TOKEN'])) {
        $v = trim((string)$_SERVER['HTTP_X_APP_TOKEN']);
    }
    if ($v === '' && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = trim((string)$_SERVER['HTTP_AUTHORIZATION']);
        if (stripos($auth, 'Bearer ') === 0) $v = trim(substr($auth, 7));
    }
    return $v;
}

function app_token_hash($token)
{
    return hash('sha256', (string)$token);
}

function app_token_issue($acc, $platform = '', $deviceName = '', $appVersion = '')
{
    $raw = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $id = 'TK' . date('YmdHis') . bin2hex(random_bytes(4));
    $now = now_dt();
    $expires = date('Y-m-d H:i:s', time() + app_token_ttl_seconds());

    $st = db()->prepare('INSERT INTO app_tokens (id, account_id, token_hash, platform, device_name, app_version, created_at, last_used_at, expires_at, revoked_at) VALUES (?,?,?,?,?,?,?,NULL,?,NULL)');
    $st->execute(array(
        $id,
        $acc['id'],
        app_token_hash($raw),
        str_limit($platform, 20),
        str_limit($deviceName, 80),
        str_limit($appVersion, 20),
        $now,
        $expires
    ));

    /* 顺带清理该账号 90 天前的过期/已撤销令牌，失败不影响登录 */
    try {
        $q = db()->prepare('DELETE FROM app_tokens WHERE account_id = ? AND created_at < ?');
        $q->execute(array($acc['id'], date('Y-m-d H:i:s', time() - 90 * 86400)));
    } catch (Exception $e) {
        error_log('app_token cleanup failed: ' . $e->getMessage());
    }

    return array(
        'token' => $raw,
        'id' => $id,
        'expiresAt' => iso($expires),
        'expiresAtRaw' => $expires
    );
}

function app_token_find($raw)
{
    if ($raw === '') return null;
    $st = db()->prepare('SELECT * FROM app_tokens WHERE token_hash = ? LIMIT 1');
    $st->execute(array(app_token_hash($raw)));
    $row = $st->fetch();
    return $row ? $row : null;
}

function app_token_revoke($id)
{
    try {
        $st = db()->prepare('UPDATE app_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL');
        $st->execute(array(now_dt(), $id));
    } catch (Exception $e) {
        error_log('app_token revoke failed: ' . $e->getMessage());
    }
}

/**
 * 当前请求若携带 Token，则解析并校验；不带 Token 返回 null（回落到 Session）。
 * Token 无效/过期/撤销时直接抛统一错误码。
 */
function app_token_current_account()
{
    static $resolved = false;
    static $acc = null;
    if ($resolved) return $acc;
    $resolved = true;

    $raw = app_token_header_value();
    if ($raw === '') return null;

    $row = app_token_find($raw);
    if (!$row) throw new ApiException('登录已失效，请重新登录', 'TOKEN_INVALID', 401);
    if (!empty($row['revoked_at'])) throw new ApiException('登录已失效，请重新登录', 'TOKEN_REVOKED', 401);
    if (strtotime($row['expires_at']) <= time()) throw new ApiException('登录已过期，请重新登录', 'TOKEN_EXPIRED', 401);

    $account = account_by_id($row['account_id']);
    if (!$account) throw new ApiException('账号不存在，请重新登录', 'TOKEN_INVALID', 401);
    if ($account['status'] === 'disabled') throw new ApiException('账号已停用，请联系店长', 'DISABLED', 403);

    /* 最后使用时间最多每 5 分钟落库一次，避免每个请求都写库 */
    if (empty($row['last_used_at']) || strtotime($row['last_used_at']) < time() - 300) {
        try {
            $st = db()->prepare('UPDATE app_tokens SET last_used_at = ? WHERE id = ?');
            $st->execute(array(now_dt(), $row['id']));
        } catch (Exception $e) {
            /* 静默 */
        }
    }

    $acc = $account;
    return $acc;
}

/* ---------------- App 登录 / 会话 / 续期 / 退出 ---------------- */

function api_auth_app_login($in)
{
    $phone = trim((string)(isset($in['phone']) ? $in['phone'] : ''));
    $password = (string)(isset($in['password']) ? $in['password'] : '');
    if (!preg_match('/^1[3-9]\d{9}$/', $phone)) throw new ApiException('请输入正确的 11 位手机号', 'BAD_PHONE', 400);
    if ($password === '') throw new ApiException('请输入密码', 'BAD_PASSWORD', 400);

    /* 与网页登录共用失败锁定表，避免被用来绕过锁定 */
    $st = db()->prepare('SELECT * FROM login_locks WHERE phone = ?');
    $st->execute(array($phone));
    $lock = $st->fetch();
    if ($lock && $lock['lock_until'] && strtotime($lock['lock_until']) > time()) {
        $mins = (int)ceil((strtotime($lock['lock_until']) - time()) / 60);
        throw new ApiException('尝试次数过多，请 ' . $mins . ' 分钟后重试或联系店长', 'LOCKED', 400);
    }

    $st = db()->prepare('SELECT * FROM accounts WHERE phone = ?');
    $st->execute(array($phone));
    $acc = $st->fetch();

    $ok = $acc && $acc['password_hash'] !== '!install' && password_verify($password, $acc['password_hash']);
    if (!$ok) {
        if ($acc) {
            $fails = $lock ? ((int)$lock['fails'] + 1) : 1;
            if ($fails >= 5) {
                $until = date('Y-m-d H:i:s', time() + 15 * 60);
                $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,0,?,?)');
                $q->execute(array($phone, $until, now_dt()));
                throw new ApiException('尝试次数过多，请 15 分钟后重试或联系店长', 'LOCKED', 400);
            }
            $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,?,NULL,?)');
            $q->execute(array($phone, $fails, now_dt()));
        }
        throw new ApiException('手机号或密码不正确', 'BAD_CREDENTIALS', 400);
    }

    $staff = staff_by_id($acc['staff_id']);
    if ($acc['status'] === 'disabled') {
        if ($staff && $staff['status'] === 'resigned') {
            throw new ApiException('账号已停用，如需查询历史薪资请联系店长', 'DISABLED', 403);
        }
        throw new ApiException('账号已停用，请联系店长', 'DISABLED', 403);
    }

    $q = db()->prepare('REPLACE INTO login_locks (phone, fails, lock_until, updated_at) VALUES (?,0,NULL,?)');
    $q->execute(array($phone, now_dt()));
    $q = db()->prepare('UPDATE accounts SET last_login_at = ?, first_login = 0 WHERE id = ?');
    $q->execute(array(now_dt(), $acc['id']));

    $token = app_token_issue(
        $acc,
        in_str($in, 'platform', 20),
        in_str($in, 'deviceName', 80),
        in_str($in, 'appVersion', 20)
    );

    audit_log('App 登录', $acc['name'], '角色：' . $acc['role'] . '；平台：' . in_str($in, 'platform', 20));

    return array(
        'token' => $token['token'],
        'expiresAt' => $token['expiresAt'],
        'account' => account_out($acc),
        'staff' => $staff ? staff_out($staff) : null,
        'store' => store_info(),
        'serverTime' => date('c')
    );
}

function api_auth_app_session($in)
{
    $acc = require_login();
    $staff = staff_by_id($acc['staff_id']);
    $row = app_token_find(app_token_header_value());
    return array(
        'account' => account_out($acc),
        'staff' => $staff ? staff_out($staff) : null,
        'store' => store_info(),
        'expiresAt' => $row ? iso($row['expires_at']) : null,
        'serverTime' => date('c')
    );
}

function api_auth_app_refresh($in)
{
    $acc = require_login();
    $raw = app_token_header_value();
    $row = app_token_find($raw);
    if (!$row) throw new ApiException('登录已失效，请重新登录', 'TOKEN_INVALID', 401);

    app_token_revoke($row['id']);
    $token = app_token_issue(
        $acc,
        in_str($in, 'platform', 20),
        in_str($in, 'deviceName', 80),
        in_str($in, 'appVersion', 20)
    );
    return array(
        'token' => $token['token'],
        'expiresAt' => $token['expiresAt'],
        'serverTime' => date('c')
    );
}

function api_auth_app_logout($in)
{
    $raw = app_token_header_value();
    $row = app_token_find($raw);
    if ($row && empty($row['revoked_at'])) {
        app_token_revoke($row['id']);
        $acc = account_by_id($row['account_id']);
        if ($acc) audit_log('App 退出登录', $acc['name'], '');
    }
    /* 幂等：Token 无效或已撤销也返回成功，客户端清本地即可 */
    return array('ok' => true);
}
