package com.tastien.storestaff.nativeapp.notify

import android.content.Context
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject

data class NotifyEvent(
    val id: String,
    val category: String,
    val title: String,
    val body: String,
    val route: String,
    val refId: String,
    val createdAt: String,
    val level: String
)

/**
 * 拉取 notify.feed 并弹本地通知。
 * 去重：同一 event.id 在 7 天内只弹一次（NotifyPrefs）。
 * 免打扰：静默期内既不弹也不标记，解除后下一轮补发。
 */
object NotifyRepository {

    suspend fun poll(context: Context): Int {
        if (!SessionStore.hasToken) return 0

        val data = try {
            ApiClient.post("notify.feed")
        } catch (e: ApiException) {
            if (e.code == "NETWORK_ERROR") return 0
            throw e
        }

        val events = data.array("events") ?: return 0
        var posted = 0
        for (element in events) {
            val obj = element as? JsonObject ?: continue
            val id = obj.text("id")
            if (id.isBlank() || NotifyPrefs.isSeen(id)) continue

            val event = NotifyEvent(
                id = id,
                category = obj.text("category"),
                title = obj.text("title"),
                body = obj.text("body"),
                route = obj.text("route"),
                refId = obj.text("refId"),
                createdAt = obj.text("createdAt"),
                level = obj.text("level")
            )

            if (!NotifyPrefs.isEnabled()) {
                NotifyPrefs.markSeen(id)
                continue
            }
            if (NotifyPrefs.inQuietHours()) {
                continue
            }

            NotificationHelper.show(context, event)
            NotifyPrefs.markSeen(id)
            posted++
        }
        NotifyPrefs.pruneSeen()
        return posted
    }
}
