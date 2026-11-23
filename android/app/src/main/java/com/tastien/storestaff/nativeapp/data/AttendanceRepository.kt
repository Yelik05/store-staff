package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class AttendanceTag(
    val text: String = "",
    val cls: String = ""
)

data class AttendanceSegment(
    val workDate: String = "",
    val segmentNo: Int = 1,
    val plannedIn: String = "",
    val plannedOut: String = "",
    val plannedHours: Double = 0.0,
    val mealHours: Double = 0.0,
    val plannedWorkHours: Double = 0.0,
    val clockIn: String = "",
    val clockOut: String = "",
    val confirmIn: String = "",
    val confirmOut: String = "",
    val actualHours: Double = 0.0,
    val hourDiff: Double = 0.0,
    val managerConfirm: Boolean = false,
    val employeeConfirm: Boolean = false,
    val tags: List<AttendanceTag> = emptyList()
)

data class AttendanceDay(
    val date: String = "",
    val totalHours: Double = 0.0,
    val abnormal: Boolean = false,
    val segments: List<AttendanceSegment> = emptyList()
)

data class AttendanceSummary(
    val workDays: Int = 0,
    val totalHours: Double = 0.0,
    val abnormalCount: Int = 0
)

data class AttendanceMonth(
    val month: String = "",
    val summary: AttendanceSummary = AttendanceSummary(),
    val days: List<AttendanceDay> = emptyList()
)

object AttendanceRepository {

    /** 月度考勤：参数 {month:"yyyy-MM"}，返回汇总与按天时段明细。 */
    suspend fun my(month: String): AttendanceMonth {
        val data = ApiClient.post("attendance.my", buildJsonObject { put("month", month) })
        val summary = data.obj("summary")
        val days = data.array("days")
        if (summary == null && days == null) {
            throw ApiException("PARSE_ERROR", "考勤数据解析失败")
        }
        return AttendanceMonth(
            month = data.text("month").ifBlank { month },
            summary = AttendanceSummary(
                workDays = summary?.int("workDays") ?: 0,
                totalHours = summary?.number("totalHours") ?: 0.0,
                abnormalCount = summary?.int("abnormalCount") ?: 0
            ),
            days = days?.objects()?.map(::parseDay) ?: emptyList()
        )
    }

    private fun parseDay(d: JsonObject): AttendanceDay = AttendanceDay(
        date = d.text("date"),
        totalHours = d.number("totalHours"),
        abnormal = d.bool("abnormal"),
        segments = d.array("segments")?.objects()?.map(::parseSegment) ?: emptyList()
    )

    private fun parseSegment(s: JsonObject): AttendanceSegment = AttendanceSegment(
        workDate = s.text("workDate"),
        segmentNo = s.int("segmentNo"),
        plannedIn = s.text("plannedIn"),
        plannedOut = s.text("plannedOut"),
        plannedHours = s.number("plannedHours"),
        mealHours = s.number("mealHours"),
        plannedWorkHours = s.number("plannedWorkHours"),
        clockIn = s.text("clockIn"),
        clockOut = s.text("clockOut"),
        confirmIn = s.text("confirmIn"),
        confirmOut = s.text("confirmOut"),
        actualHours = s.number("actualHours"),
        hourDiff = s.number("hourDiff"),
        managerConfirm = s.bool("managerConfirm"),
        employeeConfirm = s.bool("employeeConfirm"),
        tags = s.array("tags")?.objects()?.map {
            AttendanceTag(text = it.text("text"), cls = it.text("cls"))
        } ?: emptyList()
    )

    private fun JsonObject.number(key: String): Double = text(key).toDoubleOrNull() ?: 0.0
}
