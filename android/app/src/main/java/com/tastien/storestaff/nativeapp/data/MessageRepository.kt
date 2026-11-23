package com.tastien.storestaff.nativeapp.data

import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.array
import com.tastien.storestaff.nativeapp.core.bool
import com.tastien.storestaff.nativeapp.core.int
import com.tastien.storestaff.nativeapp.core.obj
import com.tastien.storestaff.nativeapp.core.objects
import com.tastien.storestaff.nativeapp.core.text
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

data class MessageItem(
    val id: String = "",
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val link: String = "",
    val refId: String = "",
    val read: Boolean = false,
    val createdAt: String = "",
    val threadId: String = "",
    val isMine: Boolean = false
)

data class MessagePage(
    val items: List<MessageItem> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val pageSize: Int = 5,
    val totalPages: Int = 1,
    val unreadAll: Int = 0,
    val unreadSystem: Int = 0,
    val unreadTask: Int = 0
)

data class ThreadItem(
    val id: String = "",
    val peerId: String = "",
    val peerName: String = "",
    val lastText: String = "",
    val lastAt: String = "",
    val lastIsMine: Boolean = false,
    val unread: Int = 0
)

data class MessageThread(
    val peerId: String = "",
    val peerName: String = "",
    val messages: List<MessageItem> = emptyList()
)

object MessageRepository {

    /** scope 取 system / task；分页由服务端完成，默认每页 5 条。 */
    suspend fun list(scope: String, page: Int): MessagePage {
        val data = ApiClient.post(
            "message.list",
            buildJsonObject {
                put("scope", scope)
                put("page", page)
                put("pageSize", 5)
            }
        )
        val unread = data.obj("unread")
        return MessagePage(
            items = data.array("list")?.objects()?.map(::parseMessage) ?: emptyList(),
            total = data.int("total"),
            page = data.int("page").coerceAtLeast(1),
            pageSize = data.int("pageSize").let { if (it <= 0) 5 else it },
            totalPages = data.int("totalPages").coerceAtLeast(1),
            unreadAll = unread?.int("all") ?: 0,
            unreadSystem = unread?.int("system") ?: 0,
            unreadTask = unread?.int("task") ?: 0
        )
    }

    suspend fun threads(): Pair<List<ThreadItem>, Int> {
        val data = ApiClient.post("message.threads")
        val list = data.array("list")?.objects()?.map {
            ThreadItem(
                id = it.text("id"),
                peerId = it.text("peerId"),
                peerName = it.text("peerName"),
                lastText = it.text("lastText"),
                lastAt = it.text("lastAt"),
                lastIsMine = it.bool("lastIsMine"),
                unread = it.int("unread")
            )
        } ?: emptyList()
        return list to data.int("unreadCount")
    }

    /** 进入会话即标记已读，返回时间正序消息。 */
    suspend fun thread(peerId: String): MessageThread {
        val data = ApiClient.post(
            "message.thread",
            buildJsonObject { put("peerId", peerId) }
        )
        val info = data.obj("thread")
        return MessageThread(
            peerId = info?.text("peerId") ?: peerId,
            peerName = info?.text("peerName") ?: "",
            messages = data.array("messages")?.objects()?.map(::parseMessage) ?: emptyList()
        )
    }

    suspend fun send(toStaffId: String, body: String): MessageItem? {
        val data = ApiClient.post(
            "message.send",
            buildJsonObject {
                put("toStaffId", toStaffId)
                put("body", body)
            }
        )
        return data.obj("message")?.let(::parseMessage)
    }

    suspend fun markRead(id: String) {
        ApiClient.post("message.read", buildJsonObject { put("id", id) })
    }

    suspend fun markAllRead() {
        ApiClient.post("message.readAll")
    }

    /** 底部 Tab 角标：全部未读（含私信）。 */
    suspend fun unreadCount(): Int {
        val data = ApiClient.post("message.unread")
        return data.int("unreadCount")
    }

    private fun parseMessage(m: JsonObject): MessageItem = MessageItem(
        id = m.text("id"),
        type = m.text("type"),
        title = m.text("title"),
        body = m.text("body"),
        link = m.text("link"),
        refId = m.text("refId"),
        read = m.bool("read"),
        createdAt = m.text("createdAt"),
        threadId = m.text("threadId"),
        isMine = m.bool("isMine")
    )
}
