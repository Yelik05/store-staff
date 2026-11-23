# 网页端与管理后台（PHP + MySQL）

门店人员管理系统的 Web 端，包含员工端页面与管理员后台，同时提供原生 App 使用的 JSON 接口。无前端构建步骤，纯 PHP + 原生 JavaScript/CSS，上传到任意支持 PHP 的主机即可运行。

## 技术栈

| 项 | 说明 |
| --- | --- |
| 后端 | PHP 7.4+（推荐 8.x），PDO MySQL |
| 数据库 | MySQL 5.7+ / MariaDB 10.3+，utf8mb4 |
| 前端 | 原生 HTML/CSS/JavaScript，无框架、无打包 |
| 鉴权 | 网页 Session；原生 App 使用 `X-App-Token` |
| 部署 | Apache（含 `.htaccess`）或 Nginx + PHP-FPM |

## 目录说明

```
web/
├── api.php                 # 接口单入口：POST api.php?action=xxx
├── install.php             # 安装向导：生成 config.php、导入 schema.sql
├── config.sample.php       # 配置样例（占位值，无真实密码）
├── schema.sql              # 完整表结构与演示数据
├── migrations/             # 增量 SQL（App Token、推送、排班分段等）
├── lib/
│   ├── bootstrap.php       # 配置、PDO、会话、通用工具
│   ├── token_auth.php      # App Token 鉴权
│   ├── api_routes.php      # action 路由表
│   └── *_actions.php       # 各业务模块（任务、排班、考勤、薪资、效期、报销、消息等）
├── assets/
│   ├── css/                # 主题与基础样式
│   ├── js/                 # 公共脚本、页面脚本、扫码引擎
│   └── img/                # 图标与图片资源
├── landing/                # 产品介绍页
├── *.html                  # 员工端页面（登录、首页、任务、排班、效期、消息、我的等）
├── admin-*.html            # 管理后台页面
└── uploads/                # 运行时上传目录（未纳入仓库，需可写）
```

## 本地运行

```bash
cd web
php -S 127.0.0.1:8080
```

然后打开 <http://127.0.0.1:8080/install.php>：

1. 填写数据库地址、库名、用户名、密码；
2. 设置管理员姓名、手机号、登录密码；
3. 提交后自动生成 `config.php` 并导入表结构；
4. 确保 `uploads/` 存在且可写（安装向导会尝试创建）。

安装完成后，员工端入口为 `/login.html`，管理后台入口为 `/admin-login.html`。

> `php -S` 仅适合本地调试；生产环境请使用 Apache/Nginx + PHP-FPM，并将站点根目录指向 `web/`。

## 接口约定

- 单入口：`POST /api.php?action=<模块.动作>`，请求体为 JSON。
- 成功：`{"ok":true,"data":...}`；失败：`{"ok":false,"error":"...","code":"..."}`。
- 原生 App：先调用 `auth.appLogin` 获取 Token（30 天），后续请求带请求头 `X-App-Token`；失效返回 HTTP 401 与 `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED`。
- 推送相关接口（`push.register` 等）已预留，服务端需自行配置证书/密钥。

## 已知限制

- 仓库不含 `config.php`，首次部署必须运行安装向导；`install.php` 上线后建议删除或限制访问。
- `uploads/` 未纳入仓库，需自行创建并赋予写权限。
- 管理后台仅 Web 端提供，Android/iOS 均为员工端。
- 内含演示数据与演示账号（弱密码），仅用于本地体验；正式使用前请清空演示数据并重置密码。
- GitHub Pages 无法运行 PHP，本目录需部署到 PHP 主机。

## 安全建议

- 使用独立数据库账号，只授予当前库权限。
- 生产环境强制 HTTPS，并关闭 `display_errors`。
- 定期备份数据库与 `uploads/`。
- 发现漏洞请通过 Issue 或维护人私下反馈，不要公开利用细节。
