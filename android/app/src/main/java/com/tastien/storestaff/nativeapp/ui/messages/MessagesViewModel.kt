package com.tastien.storestaff.nativeapp.ui.messages

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.MessageItem
import com.tastien.storestaff.nativeapp.data.MessagePage
import com.tastien.storestaff.nativeapp.data.MessageRepository
import com.tastien.storestaff.nativeapp.data.ThreadItem
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class MessageScope(val label: String, val apiScope: String?) {
    System("系统通知", "system"),
    Task("任务通知", "task"),
    Private("私信", null)
}

data class ConversationUiState(
    val peerId: String = "",
    val peerName: String = "",
    val loading: Boolean = true,
    val messages: List<MessageItem> = emptyList(),
    val error: String? = null,
    val sending: Boolean = false,
    val sendError: String? = null
)

data class MessagesUiState(
    val scope: MessageScope = MessageScope.System,
    val page: MessagePage? = null,
    val listLoading: Boolean = false,
    val listError: String? = null,
    val threads: List<ThreadItem>? = null,
    val threadsLoading: Boolean = false,
    val threadsError: String? = null,
    val unreadSystem: Int = 0,
    val unreadTask: Int = 0,
    val unreadPrivate: Int = 0,
    val unreadBadge: Int = 0,
    val detail: MessageItem? = null,
    val conversation: ConversationUiState? = null,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class MessagesViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(MessagesUiState())
    val state = _state.asStateFlow()

    /* 分类页缓存：切回分类不重新请求 */
    private val pageCache = mutableMapOf<MessageScope, MessagePage>()
    private var listJob: Job? = null
    private var threadsJob: Job? = null

    init {
        loadList(MessageScope.System, 1)
        loadThreads(silent = true)
        refreshUnread()
    }

    /** 底部 Tab 角标：全部未读（含私信），由服务端汇总。 */
    fun refreshUnread() {
        viewModelScope.launch {
            try {
                val count = MessageRepository.unreadCount()
                _state.update { it.copy(unreadBadge = count) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: Exception) {
                /* 角标失败不打扰 */
            }
        }
    }

    fun selectScope(scope: MessageScope) {
        _state.update { it.copy(scope = scope, detail = null) }
        when (scope) {
            MessageScope.Private -> if (_state.value.threads == null) loadThreads()
            else -> {
                val cached = pageCache[scope]
                if (cached == null) {
                    _state.update { it.copy(listLoading = true, page = null, listError = null) }
                    loadList(scope, 1)
                } else {
                    _state.update { it.copy(page = cached, listLoading = false, listError = null) }
                }
            }
        }
    }

    fun loadCurrentPage() {
        val current = _state.value
        if (current.scope == MessageScope.Private) {
            loadThreads()
        } else {
            loadList(current.scope, current.page?.page ?: 1)
        }
    }

    fun goPage(page: Int) {
        val current = _state.value
        if (current.scope == MessageScope.Private) return
        loadList(current.scope, page)
    }

    fun openMessage(item: MessageItem) {
        _state.update { it.copy(detail = item.copy(read = true)) }
        if (item.read) return
        /* 本地先标记已读，避免重复点击角标不消失 */
        applyReadLocally(item)
        viewModelScope.launch {
            try {
                MessageRepository.markRead(item.id)
                refreshUnread()
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: Exception) {
                /* 已读失败不阻塞阅读 */
            }
        }
    }

    fun closeDetail() {
        _state.update { it.copy(detail = null) }
    }

    fun markAllRead() {
        viewModelScope.launch {
            try {
                MessageRepository.markAllRead()
                pageCache.keys.forEach { scope ->
                    val page = pageCache[scope] ?: return@forEach
                    pageCache[scope] = page.copy(items = page.items.map { it.copy(read = true) })
                }
                _state.update {
                    it.copy(
                        page = it.page?.let { p -> p.copy(items = p.items.map { m -> m.copy(read = true) }) },
                        unreadSystem = 0,
                        unreadTask = 0,
                        unreadBadge = 0,
                        flash = Flash("已全部标记为已读")
                    )
                }
                loadThreads(silent = true)
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: Exception) {
                _state.update { it.copy(flash = Flash("操作失败，请稍后重试", true)) }
            }
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }

    /* ---------------- 私信会话 ---------------- */

    fun openThread(thread: ThreadItem) {
        _state.update {
            it.copy(
                conversation = ConversationUiState(
                    peerId = thread.peerId,
                    peerName = thread.peerName,
                    loading = true
                )
            )
        }
        viewModelScope.launch {
            try {
                val detail = MessageRepository.thread(thread.peerId)
                _state.update { s ->
                    val conv = s.conversation
                    if (conv == null || conv.peerId != thread.peerId) s
                    else s.copy(
                        conversation = conv.copy(
                            loading = false,
                            peerName = detail.peerName.ifBlank { conv.peerName },
                            messages = detail.messages,
                            error = null
                        )
                    )
                }
                refreshThreadsSilently()
                refreshUnread()
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { s ->
                    s.copy(conversation = s.conversation?.copy(loading = false, error = e.message ?: "会话加载失败"))
                }
            } catch (e: Exception) {
                _state.update { s ->
                    s.copy(conversation = s.conversation?.copy(loading = false, error = "会话加载失败，请重试"))
                }
            }
        }
    }

    fun retryConversation() {
        val conv = _state.value.conversation ?: return
        openThread(ThreadItem(peerId = conv.peerId, peerName = conv.peerName))
    }

    fun closeConversation() {
        _state.update { it.copy(conversation = null) }
        loadThreads(silent = true)
        refreshUnread()
    }

    fun send(body: String) {
        val conv = _state.value.conversation ?: return
        val text = body.trim()
        if (text.isEmpty() || conv.sending) return
        if (text.length > 500) {
            _state.update { it.copy(conversation = conv.copy(sendError = "消息内容不能超过 500 字")) }
            return
        }
        _state.update { it.copy(conversation = conv.copy(sending = true, sendError = null)) }
        viewModelScope.launch {
            try {
                val sent = MessageRepository.send(conv.peerId, text)
                _state.update { s ->
                    val current = s.conversation ?: return@update s
                    if (current.peerId != conv.peerId) return@update s
                    val appended = current.messages + (sent ?: MessageItem(
                        body = text,
                        isMine = true,
                        read = true
                    ))
                    s.copy(conversation = current.copy(messages = appended, sending = false, sendError = null))
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { s ->
                    s.copy(conversation = s.conversation?.copy(sending = false, sendError = e.message ?: "发送失败"))
                }
            } catch (e: Exception) {
                _state.update { s ->
                    s.copy(conversation = s.conversation?.copy(sending = false, sendError = "发送失败，请重试"))
                }
            }
        }
    }

    fun clearSendError() {
        _state.update { s -> s.copy(conversation = s.conversation?.copy(sendError = null)) }
    }

    /* ---------------- 内部 ---------------- */

    private fun loadList(scope: MessageScope, page: Int) {
        val apiScope = scope.apiScope ?: return
        listJob?.cancel()
        listJob = viewModelScope.launch {
            _state.update { it.copy(listLoading = true, listError = null) }
            try {
                val result = MessageRepository.list(apiScope, page)
                pageCache[scope] = result
                _state.update { s ->
                    if (s.scope != scope) s
                    else s.copy(
                        page = result,
                        listLoading = false,
                        listError = null,
                        unreadSystem = result.unreadSystem,
                        unreadTask = result.unreadTask
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(listLoading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(listLoading = false, listError = e.message ?: "加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(listLoading = false, listError = "加载失败，请稍后重试") }
            }
        }
    }

    private fun loadThreads(silent: Boolean = false) {
        if (threadsJob?.isActive == true) return
        threadsJob = viewModelScope.launch {
            _state.update { it.copy(threadsLoading = !silent && it.threads == null, threadsError = null) }
            try {
                val (list, unread) = MessageRepository.threads()
                _state.update {
                    it.copy(
                        threads = list,
                        unreadPrivate = unread,
                        threadsLoading = false,
                        threadsError = null
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(threadsLoading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(
                        threadsLoading = false,
                        threadsError = if (silent && it.threads != null) null else (e.message ?: "加载失败")
                    )
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        threadsLoading = false,
                        threadsError = if (silent && it.threads != null) null else "加载失败，请稍后重试"
                    )
                }
            }
        }
    }

    private fun refreshThreadsSilently() {
        loadThreads(silent = true)
    }

    private fun applyReadLocally(item: MessageItem) {
        pageCache.keys.toList().forEach { key ->
            val page = pageCache[key] ?: return@forEach
            if (page.items.any { it.id == item.id }) {
                pageCache[key] = page.copy(
                    items = page.items.map { if (it.id == item.id) it.copy(read = true) else it }
                )
            }
        }
        _state.update { s ->
            val isTask = item.type == "task"
            s.copy(
                page = s.page?.let { p ->
                    p.copy(items = p.items.map { if (it.id == item.id) it.copy(read = true) else it })
                },
                unreadSystem = if (!isTask) (s.unreadSystem - 1).coerceAtLeast(0) else s.unreadSystem,
                unreadTask = if (isTask) (s.unreadTask - 1).coerceAtLeast(0) else s.unreadTask,
                unreadBadge = (s.unreadBadge - 1).coerceAtLeast(0)
            )
        }
    }
}
