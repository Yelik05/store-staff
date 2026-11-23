# Android 原生端（Kotlin + Jetpack Compose）

塔斯汀门店助手员工端 Android 原生实现，功能与 Web 员工端对齐。数据全部调用线上 PHP 接口，不加载 WebView、不内置前端资源。

## 技术栈

| 项 | 值 |
| --- | --- |
| 语言 | Kotlin 2.0.21 |
| UI | Jetpack Compose（BOM 2024.10.01，Material 3） |
| 构建 | AGP 8.7.3，Gradle 8.9+，JDK 17 |
| SDK | minSdk 26 / targetSdk 34 / compileSdk 35 |
| 网络 | OkHttp 4.12 + kotlinx.serialization |
| 存储 | EncryptedSharedPreferences（Token） |
| 扫码 | CameraX 1.4 + ML Kit Barcode Scanning |
| 后台任务 | WorkManager 2.9（通知轮询） |

## 目录说明

```
android/
├── build.gradle.kts            # 根构建脚本与插件版本
├── settings.gradle.kts         # 模块与仓库配置
├── gradle.properties
└── app/
    ├── build.gradle.kts        # 应用模块、依赖、SDK 版本
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/tastien/storestaff/nativeapp/
        │   ├── MainActivity.kt
        │   ├── data/           # 接口仓库与数据模型
        │   ├── ui/             # 登录、首页、任务、排班、效期、消息、考勤、薪资、量化分、报销、通讯录、日程、我的
        │   ├── notify/         # 本地通知、去重、免打扰
        │   └── push/           # 推送提供者（Firebase 接入预留）
        └── res/                # 图标、字符串、主题
```

## 构建与安装

方式一：Android Studio（推荐）

1. 用 Android Studio（Ladybug 或更新版本）打开 `android/`；
2. 等待 Gradle Sync 完成；
3. 运行 `app` 配置到真机或模拟器。

方式二：命令行

项目未附带 Gradle Wrapper，首次可生成：

```bash
cd android
gradle wrapper --gradle-version 8.9
./gradlew assembleDebug
```

产物：`app/build/outputs/apk/debug/app-debug.apk`

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Release 包未配置签名，如需发布请自行创建 keystore 并配置 `signingConfigs`（不要把 keystore 与密码提交到仓库）。

## 接口与鉴权

- 入口地址与网页端相同（`https://<你的域名>/api.php?action=...`）。
- 登录调用 `auth.appLogin` 换取 Token，之后请求头带 `X-App-Token`。
- 401 且返回 `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` 时自动退出登录。

## 已知限制

- 无管理后台，管理功能请使用网页端。
- 未内置 `google-services.json`；如需 FCM 推送，请自行创建 Firebase 项目并接入，代码中已预留 `push/` 扩展点。
- 相机扫码需要用户授予相机权限。
- 通知依赖周期拉取，系统省电策略可能延迟提醒。
