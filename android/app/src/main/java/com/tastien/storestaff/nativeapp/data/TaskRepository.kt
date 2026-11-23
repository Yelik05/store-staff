package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.strings
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** 员工端任务实例（字段对齐后端 task_instance_out）。 */
data class TaskItem(
    val id: Long = 0,
    val templateId: String = "",
    val parentId: String = "",
    val title: String = "",
    val content: String = "",
    val cycle: String = "",
    val cycleLabel: String = "",
    val periodDate: String = "",
    val deadlineText: String = "",
    val status: String = "",
    val statusLabel: String = "",
    val assigneeId: String = "",
    val assigneeDisplayName: String = "",
    val assigneeSource: String = "",
    val completionMode: String = "upload",
    val completionScope: String = "any",
    val progressText: String = "",
    val missingNames: List<String> = emptyList(),
    val sampleImages: List<String> = emptyList(),
    val images: List<String> = emptyList(),
    val rejectReason: String = "",
    val groupTitle: String = "",
    val kindId: String = "",
    val kindName: String = "",
    val submitterName: String = "",
    val mySubmitted: Boolean = false
)

/** 分组任务（母任务 + 子任务列表）。 */
data class TaskGroup(
    val parentId: String = "",
    val title: String = "",
    val content: String = "",
    val cycle: String = "",
    val cycleLabel: String = "",
    val periodDate: String = "",
    val defaultAssigneeId: String = "",
    val defaultAssigneeDisplayName: String = "",
    val progressText: String = "",
    val done: Boolean = false,
    val overdue: Int = 0,
    val total: Int = 0,
    val children: List<TaskItem> = emptyList()
)

data class TaskOverview(
    val items: List<TaskItem> = emptyList(),
    val groups: List<TaskGroup> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val today: String = "",
    val todayPending: Int = 0,
    val overdueCount: Int = 0,
    val myStaffId: String = "",
    val canManage: Boolean = false
)

data class TaskArchive(
    val items: List<TaskItem> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val date: String = "",
    val today: String = ""
)

data class TaskContact(
    val id: String = "",
    val displayName: String = "",
    val position: String = ""
)

object TaskRepository {

    suspend fun overview(): TaskOverview {
        val data = ApiClient.post("task.employee.list")
        return TaskOverview(
            items = data.array("list")?.objects()?.map(::parseItem) ?: emptyList(),
            groups = data.array("groups")?.objects()?.map(::parseGroup) ?: emptyList(),
            counts = parseCounts(data.obj("counts")),
            today = data.text("today"),
            todayPending = data.int("todayPending"),
            overdueCount = data.int("overdueCount"),
            myStaffId = data.text("myStaffId"),
            canManage = data.bool("canManage")
        )
    }

    suspend fun submit(id: Long, imageKeys: List<String>) {
        val payload = buildJsonObject {
            put("id", id)
            if (imageKeys.isNotEmpty()) {
                putJsonArray("images") { imageKeys.forEach { add(it) } }
            }
        }
        ApiClient.post("task.employee.submit", payload)
    }

    suspend fun reassign(id: Long?, groupId: String?, assigneeId: String) {
        val payload = buildJsonObject {
            if (id != null && id > 0) put("id", id)
            if (!groupId.isNullOrBlank()) put("groupId", groupId)
            put("assigneeId", assigneeId)
        }
        ApiClient.post("task.reassign", payload)
    }

    /** 管理岗（店长/店助）代完成他人任务，不进审核并留痕。 */
    suspend fun manageComplete(id: Long) {
        ApiClient.post("task.manage.complete", buildJsonObject { put("id", id) })
    }

    suspend fun overdue(): TaskArchive {
        val data = ApiClient.post("task.employee.overdue")
        return TaskArchive(
            items = data.array("list")?.objects()?.map(::parseItem) ?: emptyList(),
            counts = parseCounts(data.obj("counts")),
            date = data.text("date"),
            today = data.text("today")
        )
    }

    suspend fun completed(date: String): TaskArchive {
        val data = ApiClient.post(
            "task.completed",
            buildJsonObject { put("date", date) }
        )
        return TaskArchive(
            items = data.array("list")?.objects()?.map(::parseItem) ?: emptyList(),
            counts = parseCounts(data.obj("counts")),
            date = data.text("date"),
            today = data.text("today")
        )
    }

    suspend fun contacts(): List<TaskContact> {
        val data = ApiClient.post("staff.contacts")
        return data.array("list")?.objects()?.map {
            TaskContact(
                id = it.text("id"),
                displayName = it.text("displayName").ifBlank { it.text("name") },
                position = it.text("position")
            )
        } ?: emptyList()
    }

    private fun parseItem(r: JsonObject): TaskItem {
        val sample = r.strings("effectiveSampleImages").ifEmpty { r.strings("sampleImages") }
        return TaskItem(
            id = r.text("id").toLongOrNull() ?: 0L,
            templateId = r.text("templateId"),
            parentId = r.text("parentId"),
            title = r.text("title"),
            content = r.text("content"),
            cycle = r.text("cycle"),
            cycleLabel = r.text("cycleLabel"),
            periodDate = r.text("periodDate"),
            deadlineText = r.text("deadlineText").ifBlank { r.text("deadlineAt") },
            status = r.text("status"),
            statusLabel = r.text("statusLabel"),
            assigneeId = r.text("assigneeId"),
            assigneeDisplayName = r.text("assigneeDisplayName"),
            assigneeSource = r.text("assigneeSource"),
            completionMode = r.text("completionMode").ifBlank { "upload" },
            completionScope = r.text("completionScope").ifBlank { "any" },
            progressText = r.text("progressText"),
            missingNames = r.strings("missingNames"),
            sampleImages = sample,
            images = r.strings("images"),
            rejectReason = r.text("rejectReason"),
            groupTitle = r.text("groupTitle"),
            kindId = r.text("kindId"),
            kindName = r.text("kindName"),
            submitterName = r.text("submitterName"),
            mySubmitted = r.bool("mySubmitted")
        )
    }

    private fun parseGroup(g: JsonObject): TaskGroup = TaskGroup(
        parentId = g.text("parentId"),
        title = g.text("title"),
        content = g.text("content"),
        cycle = g.text("cycle"),
        cycleLabel = g.text("cycleLabel"),
        periodDate = g.text("periodDate"),
        defaultAssigneeId = g.text("defaultAssigneeId"),
        defaultAssigneeDisplayName = g.text("defaultAssigneeDisplayName"),
        progressText = g.text("progressText"),
        done = g.bool("done"),
        overdue = g.int("overdue"),
        total = g.int("total"),
        children = g.array("children")?.objects()?.map(::parseItem) ?: emptyList()
    )

    private fun parseCounts(o: JsonObject?): Map<String, Int> {
        if (o == null) return emptyMap()
        return o.keys.associateWith { o.int(it) }
    }
}
