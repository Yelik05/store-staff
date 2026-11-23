package com.tastien.storestaff.nativeapp.push

import android.content.Context
import android.os.Build
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.AppConfig
import com.tastien.storestaff.nativeapp.core.SessionStore
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * FCM / APNs 预留接入点。
 *
 * 当前未引入 Firebase SDK，provider 为 Noop，App 完全依赖本地通知轮询（notify.feed）。
 * 接入 FCM 时：
 * 1. 在 app/build.gradle.kts 增加
 *    id("com.google.gms.google-services") 与 Firebase BoM / firebase-messaging-ktx；
 * 2. 放入 google-services.json；
 * 3. 实现 FcmPushProvider（FirebaseMessaging.getInstance().token），
 *    在 Application 中把 PushRegistry.provider 指向它；
 * 4. 登录成功后调用 PushRegistry.sync(context) 上报 Token（服务端 push.register）。
 * 服务端已在 app_device_tokens 记账，并预留 push_send_fcm / push_send_apns。
 */
interface PushProvider {
    val enabled: Boolean
    suspend fun obtainToken(context: Context): String?
    suspend fun deleteToken(context: Context)
}

object NoopPushProvider : PushProvider {
    override val enabled: Boolean = false
    override suspend fun obtainToken(context: Context): String? = null
    override suspend fun deleteToken(context: Context) = Unit
}

object PushRegistry {
    /** 接入 FCM/APNs 后替换该实现即可，其余代码无需改动。 */
    var provider: PushProvider = NoopPushProvider

    suspend fun sync(context: Context) {
        if (!SessionStore.hasToken) return
        if (!provider.enabled) return
        val token = try {
            provider.obtainToken(context)
        } catch (e: Exception) {
            null
        } ?: return

        try {
            ApiClient.post(
                "push.register",
                buildJsonObject {
                    put("platform", AppConfig.PLATFORM)
                    put("token", token)
                    put("deviceName", Build.MODEL ?: "Android")
                    put("appVersion", AppConfig.APP_VERSION)
                }
            )
        } catch (e: Exception) {
            /* Token 上报失败不阻塞主流程，下次启动重试 */
        }
    }

    suspend fun unregister(context: Context) {
        if (!provider.enabled) return
        try {
            ApiClient.post("push.unregister")
        } catch (e: Exception) {
            /* 忽略 */
        }
        try {
            provider.deleteToken(context)
        } catch (e: Exception) {
            /* 忽略 */
        }
    }
}
