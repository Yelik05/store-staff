# iOS 原生端（SwiftUI）

塔斯汀门店助手的 iOS 原生实现，使用 SwiftUI + URLSession + AVFoundation + Vision，功能与 Web/Android 员工端对齐。数据全部调用线上 PHP 接口，不加载 WebView、不内置前端资源。

## 基本信息

| 项 | 值 |
| --- | --- |
| 显示名称 | 塔斯汀门店助手 |
| Bundle ID | `com.tastien.storestaff.native` |
| 最低系统 | iOS 15.0 |
| 设备 | iPhone（竖屏） |
| 语言/UI | Swift 5 + SwiftUI |
| 鉴权 | `auth.appLogin` 换取 Token，请求头 `X-App-Token`，30 天有效 |
| 登录失效 | HTTP 401 + `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` |

## 目录说明

```
ios/
├── StoreStaffNative.xcodeproj/         # Xcode 工程（含共享 Scheme）
└── StoreStaffNative/
    ├── StoreStaffApp.swift             # App 入口 + AppDelegate
    ├── Theme.swift                     # 颜色、字号、圆角、格式化
    ├── Core.swift                      # 配置、Keychain 会话、APIClient、JSON 容错
    ├── Models.swift                    # 数据模型与解析
    ├── Repositories.swift              # 接口封装
    ├── Components.swift                # 徽章、图片、今日排班卡、Toast
    ├── AppRootView.swift               # 根导航、四格底栏、我的
    ├── LoginView.swift
    ├── HomeView.swift
    ├── TasksView.swift
    ├── ScheduleView.swift
    ├── ExpiryView.swift
    ├── ExpiryScanner.swift             # 扫码 + OCR + 手动输入
    ├── MessagesView.swift              # 消息 / 私信会话
    ├── MoreViews.swift                 # 考勤 / 薪资 / 量化分 / 报销 / 通讯录 / 日程
    ├── Notify.swift                    # 本地通知、轮询、APNs/BGTask
    ├── Assets.xcassets                 # AppIcon / LaunchPlate
    ├── LaunchScreen.storyboard
    └── Info.plist
```

页面范围：登录、首页（今日排班、指标、快捷入口）、任务、排班/排休、效期（含扫码）、消息/私信、我的，以及考勤、薪资、量化分、报销、通讯录、日程。底栏四格为首页、任务、排班、效期；「我的」从首页头像进入，消息从右上角铃铛进入并显示未读数。

## 构建（需要 macOS + Xcode 15 及以上）

模拟器调试：

```bash
cd ios
xcodebuild \
  -project StoreStaffNative.xcodeproj \
  -scheme StoreStaffNative \
  -configuration Debug \
  -sdk iphonesimulator \
  CODE_SIGNING_ALLOWED=NO \
  build
```

生成未签名真机包并打包 ipa：

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

mkdir -p Payload
cp -R build/StoreStaffNative.xcarchive/Products/Applications/StoreStaffNative.app Payload/
zip -qry StoreStaffNative-unsigned.ipa Payload
```

也可以把上面的命令放进任意 macOS CI（如 Codemagic 的 `macos` 实例），把 `StoreStaffNative-unsigned.ipa` 作为 artifact 输出。

## 自签安装

未签名 ipa 不能直接安装，需要用 Sideloadly 或 AltStore 以 Apple ID 重签：

1. 电脑安装 Sideloadly（Windows/macOS），连接 iPhone；
2. 选择 `StoreStaffNative-unsigned.ipa`，填写自己的 Apple ID；
3. Bundle ID 可改为自己的唯一值（如 `com.yourname.storestaff.native`）；
4. 描述文件由工具自动生成，无需手工准备；
5. 安装后在 iPhone「设置 → 通用 → VPN与设备管理」中信任开发者。

免费 Apple ID 签名 7 天有效、最多 3 个 App；需要长期使用或远程推送，请使用付费 Apple Developer Program 账号。

## 通知

- 本地通知：任务到期/逾期、私信、审批结果、今日排班、生日关怀、系统通知。
- 前台每 5 分钟拉取 `notify.feed`；后台由 `BGAppRefreshTask` 约 30 分钟兜底（系统调度不保证准时）。
- 免打扰默认 22:00–08:00，静默期不弹也不标记已读，解除后补发。
- 去重键 `notify.seen.<eventId>`，保留 7 天。
- APNs 默认关闭（`IOSPushProvider.enabled = false`）。正式接入需为 Bundle ID 开启 Push Notifications、配置描述文件与 `aps-environment`，并把 `enabled` 改为 `true`；服务端 `push.register` 已预留。

## 已知限制

- 无管理后台，管理功能请使用网页端。
- 不包含签名证书与描述文件，仓库内也没有 `codemagic.yaml`，云构建需自行配置。
- 免费签名 7 天过期，需重新签名安装。
- 扫码依赖相机权限；OCR 仅作兜底，识别失败可手动输入。
