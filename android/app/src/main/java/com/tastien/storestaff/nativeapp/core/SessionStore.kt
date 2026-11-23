package com.tastien.storestaff.nativeapp.core

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * 本地会话：Token 与少量展示信息，使用 EncryptedSharedPreferences 加密存储。
 * 不保存密码；Token 由服务端 30 天有效期，App 启动时用 auth.appSession 校验。
 */
object SessionStore {
    private const val FILE_NAME = "store_staff_native_session"
    private const val KEY_TOKEN = "token"
    private const val KEY_EXPIRES = "expiresAt"
    private const val KEY_ACCOUNT_NAME = "accountName"
    private const val KEY_ROLE = "role"
    private const val KEY_STAFF_NAME = "staffName"
    private const val KEY_POSITION = "position"
    private const val KEY_EMP_NO = "empNo"
    private const val KEY_STORE_NAME = "storeName"
    private const val KEY_PHONE = "phone"
    private const val KEY_LAST_LOGIN = "lastLoginAt"

    private var ready = false
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        if (ready) return
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        prefs = EncryptedSharedPreferences.create(
            FILE_NAME,
            masterKeyAlias,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
        ready = true
    }

    val token: String? get() = if (ready) prefs.getString(KEY_TOKEN, null) else null

    val hasToken: Boolean get() = !token.isNullOrBlank()

    val expiresAt: String get() = read(KEY_EXPIRES)
    val accountName: String get() = read(KEY_ACCOUNT_NAME)
    val role: String get() = read(KEY_ROLE)
    val staffName: String get() = read(KEY_STAFF_NAME)
    val position: String get() = read(KEY_POSITION)
    val empNo: String get() = read(KEY_EMP_NO)
    val storeName: String get() = read(KEY_STORE_NAME)
    val phone: String get() = read(KEY_PHONE)
    val lastLoginAt: String get() = read(KEY_LAST_LOGIN)

    fun save(
        token: String,
        expiresAt: String,
        accountName: String,
        role: String,
        staffName: String,
        position: String,
        empNo: String,
        storeName: String,
        phone: String = "",
        lastLoginAt: String = ""
    ) {
        if (!ready) return
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_EXPIRES, expiresAt)
            .putString(KEY_ACCOUNT_NAME, accountName)
            .putString(KEY_ROLE, role)
            .putString(KEY_STAFF_NAME, staffName)
            .putString(KEY_POSITION, position)
            .putString(KEY_EMP_NO, empNo)
            .putString(KEY_STORE_NAME, storeName)
            .putString(KEY_PHONE, phone)
            .putString(KEY_LAST_LOGIN, lastLoginAt)
            .apply()
    }

    fun updateProfile(
        accountName: String,
        role: String,
        staffName: String,
        position: String,
        empNo: String,
        storeName: String,
        phone: String = this.phone,
        lastLoginAt: String = this.lastLoginAt
    ) {
        if (!ready) return
        prefs.edit()
            .putString(KEY_ACCOUNT_NAME, accountName)
            .putString(KEY_ROLE, role)
            .putString(KEY_STAFF_NAME, staffName)
            .putString(KEY_POSITION, position)
            .putString(KEY_EMP_NO, empNo)
            .putString(KEY_STORE_NAME, storeName)
            .putString(KEY_PHONE, phone)
            .putString(KEY_LAST_LOGIN, lastLoginAt)
            .apply()
    }

    fun clear() {
        if (!ready) return
        prefs.edit().clear().apply()
    }

    private fun read(key: String): String = if (ready) prefs.getString(key, "") ?: "" else ""
}
