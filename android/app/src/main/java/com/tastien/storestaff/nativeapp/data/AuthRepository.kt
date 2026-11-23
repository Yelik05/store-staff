package com.tastien.storestaff.nativeapp.data

import android.os.Build
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.AppConfig
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object AuthRepository {

    suspend fun login(phone: String, password: String): JsonObject {
        val data = ApiClient.post(
            "auth.appLogin",
            buildJsonObject {
                put("phone", phone)
                put("password", password)
                put("platform", AppConfig.PLATFORM)
                put("deviceName", Build.MODEL ?: "Android")
                put("appVersion", AppConfig.APP_VERSION)
            }
        )

        val account = data.obj("account")
        val staff = data.obj("staff")
        val store = data.obj("store")
        val staffName = staff?.let { it.text("displayName").ifBlank { it.text("name") } } ?: ""

        SessionStore.save(
            token = data.text("token"),
            expiresAt = data.text("expiresAt"),
            accountName = account?.text("name") ?: "",
            role = account?.text("role") ?: "",
            staffName = staffName,
            position = staff?.text("position") ?: "",
            empNo = staff?.text("empNo") ?: "",
            storeName = store?.text("name") ?: "",
            phone = account?.text("phone") ?: "",
            lastLoginAt = account?.text("lastLoginAt") ?: ""
        )
        return data
    }

    /** 启动时用 Token 校验会话，同时刷新本地缓存的姓名/门店等信息 */
    suspend fun session(): JsonObject {
        val data = ApiClient.post("auth.appSession")
        val account = data.obj("account")
        val staff = data.obj("staff")
        val store = data.obj("store")
        val staffName = staff?.let { it.text("displayName").ifBlank { it.text("name") } } ?: ""
        SessionStore.updateProfile(
            accountName = account?.text("name") ?: SessionStore.accountName,
            role = account?.text("role") ?: SessionStore.role,
            staffName = staffName.ifBlank { SessionStore.staffName },
            position = staff?.text("position") ?: SessionStore.position,
            empNo = staff?.text("empNo") ?: SessionStore.empNo,
            storeName = store?.text("name") ?: SessionStore.storeName,
            phone = account?.text("phone") ?: SessionStore.phone,
            lastLoginAt = account?.text("lastLoginAt") ?: SessionStore.lastLoginAt
        )
        return data
    }

    /** 退出：先尝试撤销服务端 Token，失败也清本地 */
    suspend fun logout() {
        try {
            ApiClient.post("auth.appLogout")
        } catch (e: Exception) {
            /* 忽略 */
        } finally {
            SessionStore.clear()
        }
    }
}
