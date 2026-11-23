# 塔斯汀门店人员管理系统 · 三端源码

面向连锁门店的员工协作系统：任务闭环、效期管理、排班排休、考勤工时、薪资、量化分、报销、通讯录、私信与通知。三端共用同一套 PHP + MySQL 接口，分别提供网页端、Android 原生与 iOS 原生客户端。

> 本仓库只包含源码与文档，**不包含**真实数据库配置、上传文件、签名证书或任何访问凭据。

## 三端能力与差异

| 能力 | Web | Android | iOS |
| --- | --- | --- | --- |
| 登录 / 会话 | 手机号 + 密码，Session | Token（`X-App-Token`） | Token（`X-App-Token`） |
| 首页 / 今日排班 | ✅ | ✅ | ✅ |
| 任务（筛选、返图、改派、代完成、归档） | ✅ | ✅ | ✅ |
| 排班 / 排休申请 | ✅ | ✅ | ✅ |
| 效期登记 / 到期处理 | ✅ | ✅ | ✅ |
| 效期扫码 | 摄像头扫码（jsQR） | CameraX + ML Kit | AVFoundation + Vision |
| 消息 / 私信 | ✅ | ✅ | ✅ |
| 考勤 / 薪资 / 量化分 / 报销 / 通讯录 / 日程 | ✅ | ✅ | ✅ |
| 管理后台（员工、任务、排班、考勤、薪资、公告、设置） | ✅ | ❌ | ❌ |
| 通知 | 站内消息 | WorkManager 周期拉取 + 系统通知 | 本地通知 + 周期拉取（APNs 预留） |
| 深浅色 | 跟随系统 / 手动 | 跟随系统 | 跟随系统 |

主要差异：

- **管理后台仅在 Web 端**，两个原生 App 都是员工端。
- 原生端的数据全部来自线上 PHP 接口，不加载网页、不内置前端页面。
- iOS 使用未签名 ipa + 自签安装，免费 Apple ID 签名 7 天有效；APNs 默认关闭，接入点已预留。
- Web 端需要 PHP + MySQL 环境；GitHub Pages 只能展示导航页，不能运行 PHP。

## 目录导航

```
.
├── web/         网页端与管理后台（PHP + MySQL + 原生 JS）
├── android/     Android 原生工程（Kotlin + Jetpack Compose）
├── ios/         iOS 原生工程（SwiftUI）
├── index.html   三端可视化导航页（GitHub Pages 入口）
└── README.md
```

- 网页端说明：[web/README.md](web/README.md)
- Android 说明：[android/README.md](android/README.md)
- iOS 说明：[ios/README.md](ios/README.md)
- 可视化总页：`index.html`（开启 Pages 后访问仓库首页域名）

## 快速开始

### 网页端（PHP + MySQL）

1. 将 `web/` 上传到支持 PHP 7.4+ 的主机，Web 根目录指向 `web/`。
2. 浏览器访问 `install.php`，填写数据库信息与管理员账号，生成 `config.php`。
3. 确保 `uploads/` 目录可写（安装向导会创建）。
4. 安装完成后建议删除或限制 `install.php` 的访问。

详细步骤与目录说明见 [web/README.md](web/README.md)。

### Android（Kotlin + Compose）

```bash
# 用 Android Studio 打开 android/，或先生成 Gradle Wrapper：
cd android
gradle wrapper --gradle-version 8.9
./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。详见 [android/README.md](android/README.md)。

### iOS（SwiftUI）

```bash
cd ios
xcodebuild \
  -project StoreStaffNative.xcodeproj \
  -scheme StoreStaffNative \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/StoreStaffNative.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" CODE_SIGN_ENTITLEMENTS="" \
  archive
```

生成未签名 ipa 后，用 Sideloadly / AltStore 自签安装。详见 [ios/README.md](ios/README.md)。

## 安全与隐私

- 仓库已排除：`config.php`（真实数据库密码）、`uploads/`、日志、`.env`、签名证书、构建产物与缓存。
- `web/config.sample.php` 仅为配置样例，使用占位值。
- 演示数据中的账号密码只用于本地演示，部署后请立即修改。
- 若发现安全问题，请通过 GitHub Issue 或维护人联系方式私下反馈。

## 免责声明

本项目按「现状」提供，不含任何真实门店数据。使用前请自行评估数据合规、账号权限与服务器安全；因部署或使用产生的风险由使用者自行承担。「塔斯汀」及相关商标归其权利人所有，本项目与品牌方无隶属关系。

## 维护人

- GitHub：[@Yelik05](https://github.com/Yelik05)
- 仓库：<https://github.com/Yelik05/store-staff>

仓库暂未声明开源许可证，默认保留所有权利；如需转载或商用请联系维护人。
