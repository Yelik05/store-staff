package com.tastien.storestaff.nativeapp.notify

import android.content.Context
import android.content.SharedPreferences
import java.util.Calendar

/**
 * 通知偏好与去重记录（普通 SharedPreferences，不含敏感信息）。
 * - enabled：总开关
 * - 免打扰：默认 22:00–08:00，静默期内不弹通知也不记为已读，解除后补发
 * - seen：同一事件 ID 7 天内只弹一次
 */
object NotifyPrefs {
    private const val FILE = "store_staff_notify"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_DND_ENABLED = "dndEnabled"
    private const val KEY_DND_START = "dndStart"
    private const val KEY_DND_END = "dndEnd"
    private const val SEEN_PREFIX = "seen:"
    private const val SEEN_TTL_MS = 7L * 24 * 3600 * 1000

    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        }
    }

    fun isEnabled(): Boolean = prefs?.getBoolean(KEY_ENABLED, true) ?: true

    fun setEnabled(enabled: Boolean) {
        prefs?.edit()?.putBoolean(KEY_ENABLED, enabled)?.apply()
    }

    fun isDndEnabled(): Boolean = prefs?.getBoolean(KEY_DND_ENABLED, true) ?: true

    fun setDndEnabled(enabled: Boolean) {
        prefs?.edit()?.putBoolean(KEY_DND_ENABLED, enabled)?.apply()
    }

    fun dndStartMinute(): Int = prefs?.getInt(KEY_DND_START, 22 * 60) ?: (22 * 60)

    fun dndEndMinute(): Int = prefs?.getInt(KEY_DND_END, 8 * 60) ?: (8 * 60)

    fun inQuietHours(): Boolean {
        if (!isDndEnabled()) return false
        val start = dndStartMinute()
        val end = dndEndMinute()
        if (start == end) return false
        val cal = Calendar.getInstance()
        val now = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE)
        return if (start < end) {
            now in start until end
        } else {
            now >= start || now < end
        }
    }

    fun isSeen(eventId: String): Boolean = prefs?.contains(SEEN_PREFIX + eventId) == true

    fun markSeen(eventId: String) {
        prefs?.edit()?.putLong(SEEN_PREFIX + eventId, System.currentTimeMillis())?.apply()
    }

    /** 清理 7 天前的去重记录，避免无限增长 */
    fun pruneSeen() {
        val p = prefs ?: return
        val expireAt = System.currentTimeMillis() - SEEN_TTL_MS
        val editor = p.edit()
        for ((key, value) in p.all) {
            if (!key.startsWith(SEEN_PREFIX)) continue
            val ts = (value as? Long) ?: 0L
            if (ts < expireAt) editor.remove(key)
        }
        editor.apply()
    }
}
