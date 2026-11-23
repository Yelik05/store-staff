package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class ExpiryRecord(
    val id: String = "",
    val materialId: String = "",
    val categoryId: String = "",
    val materialName: String = "",
    val categoryName: String = "",
    val checkDate: String = "",
    val dueAt: String = "",
    val note: String = "",
    val status: String = "normal",
    val processedBy: String = "",
    val processedAt: String = "",
    val createdBy: String = ""
) {
    val isProcessed: Boolean get() = status == "processed"
    val isScrapped: Boolean get() = status == "scrapped"
}

data class ExpiryMaterial(
    val id: String = "",
    val categoryId: String = "",
    val name: String = "",
    val defaultMode: String = "",
    val defaultHours: Double = 0.0,
    val defaultTime: String = "",
    val closeDue: Boolean = false,
    val remark: String = "",
    val record: ExpiryRecord? = null
)

data class ExpiryCategory(
    val id: String = "",
    val name: String = "",
    val materials: List<ExpiryMaterial> = emptyList()
)

data class ExpiryCheckData(
    val date: String = "",
    val closeTime: String = "23:00",
    val categories: List<ExpiryCategory> = emptyList()
) {
    val materials: List<ExpiryMaterial> get() = categories.flatMap { it.materials }
}

object ExpiryRepository {

    suspend fun checkData(date: String): ExpiryCheckData {
        val data = ApiClient.post(
            "expiry.checkData",
            buildJsonObject { put("date", date) }
        )
        val categories = data.array("categories")?.objects()?.map { c ->
            ExpiryCategory(
                id = c.text("id"),
                name = c.text("name"),
                materials = c.array("materials")?.objects()?.map { m ->
                    ExpiryMaterial(
                        id = m.text("id"),
                        categoryId = m.text("categoryId"),
                        name = m.text("name"),
                        defaultMode = m.text("defaultMode"),
                        defaultHours = m.text("defaultHours").toDoubleOrNull() ?: 0.0,
                        defaultTime = m.text("defaultTime"),
                        closeDue = m.bool("closeDue"),
                        remark = m.text("remark"),
                        record = m.obj("record")?.let(::parseRecord)
                    )
                } ?: emptyList()
            )
        } ?: emptyList()
        return ExpiryCheckData(
            date = data.text("date").ifBlank { date },
            closeTime = data.text("closeTime").ifBlank { "23:00" },
            categories = categories
        )
    }

    /**
     * 单条即时保存：与网页版一致，打烊到期只提交日期，服务端自动补打烊时刻；
     * 已过期时间必须带 scrap=true，否则服务端会拒绝并要求走报废登记。
     */
    suspend fun checkSave(date: String, materialId: String, dueAt: String, scrap: Boolean) {
        val item = buildJsonObject {
            put("materialId", materialId)
            put("dueAt", dueAt)
            if (scrap) put("scrap", true)
        }
        ApiClient.post(
            "expiry.checkSave",
            buildJsonObject {
                put("date", date)
                put("items", buildJsonArray { add(item) })
            }
        )
    }

    /** 当天到期：前一日登记、今日到期的记录。 */
    suspend fun dueList(date: String): List<ExpiryRecord> {
        val data = ApiClient.post("expiry.dueList", buildJsonObject { put("date", date) })
        return data.array("list")?.objects()?.map(::parseRecord) ?: emptyList()
    }

    /** 效期总览：指定登记日期（check_date）的全部记录。 */
    suspend fun dayList(date: String): List<ExpiryRecord> {
        val data = ApiClient.post("expiry.dayList", buildJsonObject { put("date", date) })
        return data.array("list")?.objects()?.map(::parseRecord) ?: emptyList()
    }

    suspend fun process(id: String): ExpiryRecord? {
        val data = ApiClient.post("expiry.process", buildJsonObject { put("id", id) })
        return data.obj("record")?.let(::parseRecord)
    }

    private fun parseRecord(r: JsonObject): ExpiryRecord = ExpiryRecord(
        id = r.text("id"),
        materialId = r.text("materialId"),
        categoryId = r.text("categoryId"),
        materialName = r.text("materialName"),
        categoryName = r.text("categoryName"),
        checkDate = r.text("checkDate"),
        dueAt = r.text("dueAt"),
        note = r.text("note"),
        status = r.text("status").ifBlank { "normal" },
        processedBy = r.text("processedBy"),
        processedAt = r.text("processedAt"),
        createdBy = r.text("createdBy")
    )
}
