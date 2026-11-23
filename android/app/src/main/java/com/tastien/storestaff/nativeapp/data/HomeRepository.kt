package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate

data class HomeSnapshot(
    val displayName: String,
    val position: String,
    val employmentType: String,
    val empNo: String,
    val storeName: String,
    val today: String,
    val shift: ShiftToday?,
    val unread: Int,
    val todayPending: Int,
    val overdue: Int
)

object HomeRepository {

    /** 首页并发取档案、通知聚合与今日排班（排班失败不阻断首页）。 */
    suspend fun load(): HomeSnapshot = coroutineScope {
        val staffDeferred = async { ApiClient.post("staff.me") }
        val feedDeferred = async { ApiClient.post("notify.feed") }
        val shiftDeferred = async { runCatching { ShiftRepository.today() }.getOrNull() }

        val staff = staffDeferred.await()
        val feed = feedDeferred.await()
        val shift = shiftDeferred.await()
        val counts = feed.obj("counts") ?: JsonObject(emptyMap())

        val displayName = staff.text("displayName").ifBlank { staff.text("name") }
        val position = staff.text("position")
        val empNo = staff.text("empNo")

        SessionStore.updateProfile(
            accountName = SessionStore.accountName,
            role = SessionStore.role,
            staffName = displayName.ifBlank { SessionStore.staffName },
            position = position,
            empNo = empNo,
            storeName = SessionStore.storeName
        )

        HomeSnapshot(
            displayName = displayName.ifBlank { SessionStore.staffName },
            position = position,
            employmentType = staff.text("employmentType"),
            empNo = empNo,
            storeName = SessionStore.storeName,
            today = shift?.date?.ifBlank { LocalDate.now().toString() } ?: LocalDate.now().toString(),
            shift = shift,
            unread = counts.int("unreadMessages"),
            todayPending = counts.int("todayPending"),
            overdue = counts.int("overdue")
        )
    }
}
