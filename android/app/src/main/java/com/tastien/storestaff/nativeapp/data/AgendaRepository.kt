package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

data class AgendaParticipant(
    val id: String = "",
    val name: String = ""
)

data class AgendaItem(
    val id: String = "",
    val title: String = "",
    val date: String = "",
    val startTime: String = "",
    val endTime: String = "",
    val location: String = "",
    val remark: String = "",
    val remindMinutes: Int = 0,
    val status: String = "",
    val isOwner: Boolean = false,
    val isInvited: Boolean = false,
    val creatorName: String = "",
    val participants: List<AgendaParticipant> = emptyList()
)

data class AgendaData(
    val scope: String = "",
    val canViewAll: Boolean = false,
    val list: List<AgendaItem> = emptyList()
)

object AgendaRepository {

    /** scope 取 mine / all；canViewAll 由服务端下发。 */
    suspend fun list(scope: String): AgendaData {
        val data = ApiClient.post("schedule.list", buildJsonObject { put("scope", scope) })
        return AgendaData(
            scope = data.text("scope"),
            canViewAll = data.bool("canViewAll"),
            list = data.array("list")?.objects()?.map(::parseItem) ?: emptyList()
        )
    }

    suspend fun save(
        id: String?,
        title: String,
        date: String,
        startTime: String,
        endTime: String,
        location: String,
        remark: String,
        remindMinutes: Int,
        participantIds: List<String>
    ) {
        val payload = buildJsonObject {
            if (!id.isNullOrBlank()) put("id", id)
            put("title", title)
            put("date", date)
            put("startTime", startTime)
            if (endTime.isNotBlank()) put("endTime", endTime)
            if (location.isNotBlank()) put("location", location)
            if (remark.isNotBlank()) put("remark", remark)
            put("remindMinutes", remindMinutes)
            if (participantIds.isNotEmpty()) {
                putJsonArray("participantIds") { participantIds.forEach { add(it) } }
            }
        }
        ApiClient.post("schedule.save", payload)
    }

    suspend fun remove(id: String) {
        ApiClient.post("schedule.remove", buildJsonObject { put("id", id) })
    }

    private fun parseItem(r: JsonObject): AgendaItem = AgendaItem(
        id = r.text("id"),
        title = r.text("title"),
        date = r.text("date"),
        startTime = r.text("startTime"),
        endTime = r.text("endTime"),
        location = r.text("location"),
        remark = r.text("remark"),
        remindMinutes = r.int("remindMinutes"),
        status = r.text("status"),
        isOwner = r.bool("isOwner"),
        isInvited = r.bool("isInvited"),
        creatorName = r.text("creatorName"),
        participants = r.array("participants")?.objects()?.map {
            AgendaParticipant(
                id = it.text("id"),
                name = it.text("name")
            )
        } ?: emptyList()
    )
}
