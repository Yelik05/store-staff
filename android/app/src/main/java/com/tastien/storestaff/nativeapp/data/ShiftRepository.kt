package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class ShiftSegment(
    val segmentNo: Int = 1,
    val startTime: String = "",
    val endTime: String = "",
    val stationName: String = "",
    val task: String = ""
)

data class ShiftToday(
    val date: String = "",
    val segments: List<ShiftSegment> = emptyList(),
    val reminder: String = ""
)

data class ShiftSlot(
    val date: String = "",
    val start: String = "",
    val end: String = ""
)

data class ShiftRequestItem(
    val id: String = "",
    val month: String = "",
    val slots: List<ShiftSlot> = emptyList(),
    val note: String = "",
    val status: String = "",
    val createdAt: String = "",
    val reviewedBy: String = "",
    val reviewedAt: String = "",
    val rejectReason: String = "",
    val cancelRequested: Boolean = false
)

data class ShiftSummary(
    val month: String = "",
    val list: List<ShiftRequestItem> = emptyList(),
    val pendingSlots: Int = 0,
    val approvedSlots: Int = 0
)

object ShiftRepository {

    /** 今日排班（一天最多两个班段），字段与 daily_shift_out 对齐。 */
    suspend fun today(): ShiftToday {
        val data = ApiClient.post("shift.today")
        val records = data.array("records")?.objects() ?: emptyList()
        return ShiftToday(
            date = data.text("date"),
            segments = records.map {
                ShiftSegment(
                    segmentNo = it.int("segmentNo"),
                    startTime = it.text("startTime"),
                    endTime = it.text("endTime"),
                    stationName = it.text("stationName"),
                    task = it.text("task")
                )
            },
            reminder = data.text("reminder")
        )
    }

    suspend fun my(month: String): ShiftSummary {
        val data = ApiClient.post("shift.my", buildJsonObject { put("month", month) })
        return ShiftSummary(
            month = data.text("month"),
            list = data.array("list")?.objects()?.map(::parseRequest) ?: emptyList(),
            pendingSlots = data.int("pendingSlots"),
            approvedSlots = data.int("approvedSlots")
        )
    }

    /** 兼职/小时工提交可上班时段。 */
    suspend fun apply(slots: List<ShiftSlot>, note: String) {
        val payload = buildJsonObject {
            put(
                "slots",
                buildJsonArray {
                    slots.forEach { slot ->
                        add(
                            buildJsonObject {
                                put("date", slot.date)
                                put("start", slot.start)
                                put("end", slot.end)
                            }
                        )
                    }
                }
            )
            put("note", note)
        }
        ApiClient.post("shift.apply", payload)
    }

    /** action=withdraw 撤回待审批；action=cancel 申请取消已通过。 */
    suspend fun cancel(id: String, action: String) {
        ApiClient.post(
            "shift.cancel",
            buildJsonObject {
                put("id", id)
                put("action", action)
            }
        )
    }

    private fun parseRequest(r: JsonObject): ShiftRequestItem {
        val slots = r.array("slots")?.objects()?.map {
            ShiftSlot(
                date = it.text("date"),
                start = it.text("start"),
                end = it.text("end")
            )
        } ?: emptyList()
        return ShiftRequestItem(
            id = r.text("id"),
            month = r.text("month"),
            slots = slots,
            note = r.text("note"),
            status = r.text("status"),
            createdAt = r.text("createdAt"),
            reviewedBy = r.text("reviewedBy"),
            reviewedAt = r.text("reviewedAt"),
            rejectReason = r.text("rejectReason"),
            cancelRequested = r.bool("cancelRequested")
        )
    }
}
