package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class LeaveItem(
    val id: String = "",
    val date: String = "",
    val type: String = "",
    val reason: String = "",
    val status: String = "",
    val manual: Boolean = false,
    val createdAt: String = "",
    val reviewedBy: String = "",
    val reviewedAt: String = "",
    val rejectReason: String = "",
    val cancelRequested: Boolean = false,
    val forceReason: String = ""
)

data class LeaveSummary(
    val month: String = "",
    val quota: Double = 0.0,
    val used: Int = 0,
    val pending: Int = 0,
    val remaining: Double = 0.0,
    val unused: Double = 0.0,
    val byType: Map<String, Int> = emptyMap(),
    val list: List<LeaveItem> = emptyList()
)

data class LeaveDayStats(
    val date: String = "",
    val approved: Int = 0,
    val pending: Int = 0,
    val total: Int = 0,
    val storeLimit: Int = 0,
    val storeRemaining: Int = 0,
    val positionLimit: Int = 0,
    val positionRemaining: Int = 0,
    val remaining: Int = 0
)

object LeaveRepository {

    suspend fun my(month: String): LeaveSummary {
        val data = ApiClient.post("leave.my", buildJsonObject { put("month", month) })
        return LeaveSummary(
            month = data.text("month"),
            quota = data.text("quota").toDoubleOrNull() ?: 0.0,
            used = data.int("used"),
            pending = data.int("pending"),
            remaining = data.text("remaining").toDoubleOrNull() ?: 0.0,
            unused = data.text("unused").toDoubleOrNull() ?: 0.0,
            byType = parseByType(data),
            list = data.array("list")?.objects()?.map(::parseItem) ?: emptyList()
        )
    }

    suspend fun dayStats(date: String): LeaveDayStats {
        val data = ApiClient.post("leave.dayStats", buildJsonObject { put("date", date) })
        return LeaveDayStats(
            date = data.text("date"),
            approved = data.int("approved"),
            pending = data.int("pending"),
            total = data.int("total"),
            storeLimit = data.int("storeLimit"),
            storeRemaining = data.int("storeRemaining"),
            positionLimit = data.int("positionLimit"),
            positionRemaining = data.int("positionRemaining"),
            remaining = data.int("remaining")
        )
    }

    suspend fun apply(date: String, type: String, reason: String) {
        ApiClient.post(
            "leave.apply",
            buildJsonObject {
                put("date", date)
                put("type", type)
                put("reason", reason)
            }
        )
    }

    /** action=withdraw 撤回待审批；action=cancel 申请取消已通过。 */
    suspend fun cancel(id: String, action: String) {
        ApiClient.post(
            "leave.cancel",
            buildJsonObject {
                put("id", id)
                put("action", action)
            }
        )
    }

    private fun parseByType(data: JsonObject): Map<String, Int> {
        val obj = data["byType"] as? JsonObject ?: return emptyMap()
        return obj.keys.associateWith { obj.int(it) }
    }

    private fun parseItem(r: JsonObject): LeaveItem = LeaveItem(
        id = r.text("id"),
        date = r.text("date"),
        type = r.text("type"),
        reason = r.text("reason"),
        status = r.text("status"),
        manual = r.bool("manual"),
        createdAt = r.text("createdAt"),
        reviewedBy = r.text("reviewedBy"),
        reviewedAt = r.text("reviewedAt"),
        rejectReason = r.text("rejectReason"),
        cancelRequested = r.bool("cancelRequested"),
        forceReason = r.text("forceReason")
    )
}
