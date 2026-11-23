package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class ScoreDimension(
    val key: String = "",
    val name: String = "",
    val full: Double = 0.0,
    val score: Double = 0.0
)

data class ScoreAdjust(
    val reason: String = "",
    val score: Double = 0.0
)

data class ScoreRecord(
    val month: String = "",
    val total: Double = 0.0,
    val grade: String = "",
    val dims: List<ScoreDimension> = emptyList(),
    val adjust: List<ScoreAdjust> = emptyList(),
    val publishAt: String = "",
    val updatedAt: String = ""
)

data class ScoreDimensionDef(
    val key: String = "",
    val name: String = "",
    val full: Double = 0.0,
    val desc: String = ""
)

object ScoreRepository {

    /** 我的量化分月份列表（倒序由调用方排序），data 为数组，ApiClient 包装为 {"list":[...]}。 */
    suspend fun my(): List<ScoreRecord> {
        val data = ApiClient.post("score.my")
        val list = data.array("list")
            ?: throw ApiException("PARSE_ERROR", "量化分数据解析失败")
        return list.objects().map(::parseRecord)
    }

    /** 指定月份量化分；无记录时服务端返回空对象，这里以 null 表示。 */
    suspend fun get(month: String): ScoreRecord? {
        val data = ApiClient.post("score.get", buildJsonObject { put("month", month) })
        if (data.isEmpty()) return null
        if (data.text("month").isBlank() && !data.containsKey("total")) {
            throw ApiException("PARSE_ERROR", "量化分数据解析失败")
        }
        return parseRecord(data)
    }

    /** 维度配置：用于补充维度说明（desc）。 */
    suspend fun dimensions(): List<ScoreDimensionDef> {
        val data = ApiClient.post("settings.dimensions")
        val list = data.array("list")
            ?: throw ApiException("PARSE_ERROR", "维度配置解析失败")
        return list.objects().map {
            ScoreDimensionDef(
                key = it.text("key"),
                name = it.text("name"),
                full = it.number("full"),
                desc = it.text("desc")
            )
        }
    }

    private fun parseRecord(r: JsonObject): ScoreRecord = ScoreRecord(
        month = r.text("month"),
        total = r.number("total"),
        grade = r.text("grade"),
        dims = r.array("dims")?.objects()?.map {
            ScoreDimension(
                key = it.text("key"),
                name = it.text("name"),
                full = it.number("full"),
                score = it.number("score")
            )
        } ?: emptyList(),
        adjust = r.array("adjust")?.objects()?.map {
            ScoreAdjust(
                reason = it.text("reason"),
                score = it.number("score")
            )
        } ?: emptyList(),
        publishAt = r.text("publishAt"),
        updatedAt = r.text("updatedAt")
    )

    private fun JsonObject.number(key: String): Double = text(key).toDoubleOrNull() ?: 0.0
}
