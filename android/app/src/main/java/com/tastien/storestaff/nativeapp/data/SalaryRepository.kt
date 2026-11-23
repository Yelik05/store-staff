package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.strings
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class SalaryDetail(
    val month: String = "",
    val payStatus: String = "",
    val payDate: String = "",
    val publishAt: String = "",
    val remark: String = "",
    val shouldDays: Double = 0.0,
    val actualDays: Double = 0.0,
    val totalHours: Double = 0.0,
    val baseSalary: Double = 0.0,
    val postAllowance: Double = 0.0,
    val performancePay: Double = 0.0,
    val fullAttendance: Double = 0.0,
    val dailyOvertimePay: Double = 0.0,
    val statutoryHolidayPay: Double = 0.0,
    val mealSubsidy: Double = 0.0,
    val transportSubsidy: Double = 0.0,
    val attendanceSubsidy: Double = 0.0,
    val socialSubsidy: Double = 0.0,
    val commission: Double = 0.0,
    val grossPay: Double = 0.0,
    val inventoryDeduction: Double = 0.0,
    val lateDeduction: Double = 0.0,
    val attendanceDiff: Double = 0.0,
    val leaveDeduction: Double = 0.0,
    val disciplineDeduction: Double = 0.0,
    val otherDeduction: Double = 0.0,
    val insurance: Double = 0.0,
    val tax: Double = 0.0,
    val deductionTotal: Double = 0.0,
    val netPay: Double = 0.0
)

object SalaryRepository {

    /** 可查看的薪资月份（服务端返回字符串数组，ApiClient 包装为 {"list":[...]}）。 */
    suspend fun myMonths(): List<String> {
        val data = ApiClient.post("salary.myMonths")
        if (data.array("list") == null) {
            throw ApiException("PARSE_ERROR", "薪资月份解析失败")
        }
        return data.strings("list")
    }

    /** 指定月份薪资；未发布时服务端返回空对象，这里以 null 表示。 */
    suspend fun get(month: String): SalaryDetail? {
        val data = ApiClient.post("salary.get", buildJsonObject { put("month", month) })
        if (data.isEmpty()) return null
        if (data.text("month").isBlank() && !data.containsKey("netPay")) {
            throw ApiException("PARSE_ERROR", "薪资数据解析失败")
        }
        return parseDetail(data)
    }

    private fun parseDetail(d: JsonObject): SalaryDetail = SalaryDetail(
        month = d.text("month"),
        payStatus = d.text("payStatus"),
        payDate = d.text("payDate"),
        publishAt = d.text("publishAt"),
        remark = d.text("remark"),
        shouldDays = d.number("shouldDays"),
        actualDays = d.number("actualDays"),
        totalHours = d.number("totalHours"),
        baseSalary = d.number("baseSalary"),
        postAllowance = d.number("postAllowance"),
        performancePay = d.number("performancePay"),
        fullAttendance = d.number("fullAttendance"),
        dailyOvertimePay = d.number("dailyOvertimePay"),
        statutoryHolidayPay = d.number("statutoryHolidayPay"),
        mealSubsidy = d.number("mealSubsidy"),
        transportSubsidy = d.number("transportSubsidy"),
        attendanceSubsidy = d.number("attendanceSubsidy"),
        socialSubsidy = d.number("socialSubsidy"),
        commission = d.number("commission"),
        grossPay = d.number("grossPay"),
        inventoryDeduction = d.number("inventoryDeduction"),
        lateDeduction = d.number("lateDeduction"),
        attendanceDiff = d.number("attendanceDiff"),
        leaveDeduction = d.number("leaveDeduction"),
        disciplineDeduction = d.number("disciplineDeduction"),
        otherDeduction = d.number("otherDeduction"),
        insurance = d.number("insurance"),
        tax = d.number("tax"),
        deductionTotal = d.number("deductionTotal"),
        netPay = d.number("netPay")
    )

    private fun JsonObject.number(key: String): Double = text(key).toDoubleOrNull() ?: 0.0
}
