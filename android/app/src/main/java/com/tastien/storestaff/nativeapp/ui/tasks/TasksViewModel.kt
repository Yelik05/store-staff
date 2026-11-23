package com.tastien.storestaff.nativeapp.ui.tasks

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.TaskContact
import com.tastien.storestaff.nativeapp.data.TaskItem
import com.tastien.storestaff.nativeapp.data.TaskOverview
import com.tastien.storestaff.nativeapp.data.TaskRepository
import com.tastien.storestaff.nativeapp.data.UploadRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

private const val PAGE_SIZE = 10

/** 一级分类：全部 / 日 / 周 / 月 / 次 / 个人。 */
enum class TaskFilter(val label: String, val cycle: String?) {
    All("全部", null),
    Daily("日", "daily"),
    Weekly("周", "weekly"),
    Monthly("月", "monthly"),
    Once("次", "once"),
    Mine("个人", "mine")
}

data class Flash(val text: String, val error: Boolean = false)

enum class ArchiveKind { Overdue, Completed }

data class ArchiveUiState(
    val kind: ArchiveKind,
    val loading: Boolean = true,
    val items: List<TaskItem> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val date: String = LocalDate.now().toString(),
    val today: String = LocalDate.now().toString(),
    val error: String? = null
)

data class TasksUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val overview: TaskOverview? = null,
    val error: String? = null,
    val filter: TaskFilter = TaskFilter.All,
    val expanded: Set<String> = emptySet(),
    val visibleCount: Int = PAGE_SIZE,
    val actionBusy: Boolean = false,
    val uploadDone: Int = 0,
    val uploadTotal: Int = 0,
    val contacts: List<TaskContact>? = null,
    val contactsLoading: Boolean = false,
    val flash: Flash? = null,
    val completedSignal: Int = 0,
    val focusRef: String? = null,
    val focusTitleHint: String? = null,
    val focusEntryKey: String? = null,
    val sessionExpired: Boolean = false,
    val archive: ArchiveUiState? = null
)

private fun focusTarget(overview: TaskOverview, ref: String, titleHint: String): Pair<Set<String>, String?> {
    val number = ref.toLongOrNull()
    fun matchesId(task: TaskItem): Boolean =
        if (number != null) task.id == number else task.templateId == ref

    fun matchesHint(task: TaskItem): Boolean =
        titleHint.isNotBlank() && (task.title.contains(titleHint) || titleHint.contains(task.title))

    overview.items.firstOrNull { matchesId(it) }?.let {
        return setOf("t:${it.id}") to "t:${it.id}"
    }
    overview.items.firstOrNull { matchesHint(it) }?.let {
        return setOf("t:${it.id}") to "t:${it.id}"
    }
    overview.groups.forEach { group ->
        val groupHit = (number == null && group.parentId == ref) ||
            group.children.any { matchesId(it) } ||
            (titleHint.isNotBlank() && (group.title.contains(titleHint) || titleHint.contains(group.title))) ||
            group.children.any { matchesHint(it) }
        if (groupHit) {
            val keys = mutableSetOf("g:${group.parentId}|${group.periodDate}")
            group.children.firstOrNull { matchesId(it) }?.let { keys += "t:${it.id}" }
                ?: group.children.firstOrNull { matchesHint(it) }?.let { keys += "t:${it.id}" }
            return keys to "g:${group.parentId}|${group.periodDate}"
        }
    }
    return emptySet<String>() to null
}

class TasksViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(TasksUiState())
    val state = _state.asStateFlow()

    private var listJob: Job? = null
    private var archiveJob: Job? = null

    init {
        load()
    }

    fun load(refresh: Boolean = false) {
        if (listJob?.isActive == true) return
        listJob = viewModelScope.launch {
            _state.update { it.copy(loading = it.overview == null, refreshing = refresh, error = null) }
            try {
                val overview = TaskRepository.overview()
                _state.update { s ->
                    val focus = s.focusRef
                    val hint = s.focusTitleHint.orEmpty()
                    val target = if (focus != null || hint.isNotBlank()) {
                        focusTarget(overview, focus.orEmpty(), hint)
                    } else {
                        emptySet<String>() to null
                    }
                    s.copy(
                        loading = false,
                        refreshing = false,
                        overview = overview,
                        error = null,
                        expanded = s.expanded + target.first,
                        focusEntryKey = target.second ?: s.focusEntryKey
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, refreshing = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, refreshing = false, error = e.message ?: "加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, refreshing = false, error = "加载失败，请稍后重试") }
            }
        }
    }

    fun setFilter(filter: TaskFilter) {
        _state.update { it.copy(filter = filter, visibleCount = PAGE_SIZE) }
    }

    fun toggleExpanded(key: String) {
        _state.update {
            val next = if (key in it.expanded) it.expanded - key else it.expanded + key
            it.copy(expanded = next)
        }
    }

    /** 返回键：收起全部展开详情，回到列表并保留滚动位置。 */
    fun collapseAll() {
        _state.update { it.copy(expanded = emptySet()) }
    }

    fun loadMore() {
        _state.update { it.copy(visibleCount = it.visibleCount + PAGE_SIZE) }
    }

    /** 消息深链：ref 可为实例 id 或模板 id；hint 为消息正文中的任务标题。 */
    fun focusTask(ref: String, titleHint: String = "") {
        _state.update { s ->
            val overview = s.overview
            val target = if (overview != null) {
                focusTarget(overview, ref, titleHint)
            } else {
                emptySet<String>() to null
            }
            s.copy(
                filter = TaskFilter.All,
                visibleCount = 9999,
                expanded = s.expanded + target.first,
                focusRef = ref,
                focusTitleHint = titleHint.ifBlank { null },
                focusEntryKey = target.second
            )
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }

    /* ---------------- 完成 / 提交 ---------------- */

    fun completeConfirm(item: TaskItem) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                TaskRepository.submit(item.id, emptyList())
                onActionSuccess("任务已完成")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    fun manageComplete(item: TaskItem) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                TaskRepository.manageComplete(item.id)
                onActionSuccess("已代完成，记录已保存")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    fun completeWithImages(item: TaskItem, uris: List<Uri>) {        if (_state.value.actionBusy) return
        if (uris.isEmpty()) {
            _state.update { it.copy(flash = Flash("请至少选择 1 张返图", true)) }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true, uploadTotal = uris.size, uploadDone = 0) }
            try {
                val keys = ArrayList<String>(uris.size)
                uris.forEachIndexed { index, uri ->
                    keys += UploadRepository.uploadImage(getApplication<Application>(), uri)
                    _state.update { it.copy(uploadDone = index + 1) }
                }
                TaskRepository.submit(item.id, keys)
                onActionSuccess("返图已提交，等待审核")
            } catch (e: Exception) {
                handleActionError(e)
            } finally {
                _state.update { it.copy(uploadTotal = 0, uploadDone = 0) }
            }
        }
    }

    /* ---------------- 指派 / 改派 ---------------- */

    fun loadContacts() {
        val current = _state.value
        if (current.contacts != null || current.contactsLoading) return
        viewModelScope.launch {
            _state.update { it.copy(contactsLoading = true) }
            try {
                val contacts = TaskRepository.contacts()
                _state.update { it.copy(contacts = contacts, contactsLoading = false) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(contactsLoading = false, sessionExpired = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(contactsLoading = false, flash = Flash("员工列表加载失败，请重试", true))
                }
            }
        }
    }

    fun reassign(id: Long?, groupId: String?, assigneeId: String, assigneeName: String) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                TaskRepository.reassign(id, groupId, assigneeId)
                onActionSuccess("已指派给 $assigneeName")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    /* ---------------- 逾期 / 已完成 ---------------- */

    fun openArchive(kind: ArchiveKind) {
        val today = _state.value.overview?.today?.takeIf { it.isNotBlank() } ?: LocalDate.now().toString()
        _state.update {
            it.copy(archive = ArchiveUiState(kind = kind, loading = true, date = today, today = today))
        }
        fetchArchive(kind, today)
    }

    fun closeArchive() {
        archiveJob?.cancel()
        _state.update { it.copy(archive = null) }
    }

    fun archiveRetry() {
        val archive = _state.value.archive ?: return
        fetchArchive(archive.kind, archive.date)
    }

    fun shiftArchiveDate(days: Int) {
        val archive = _state.value.archive ?: return
        val today = LocalDate.parse(archive.today.ifBlank { LocalDate.now().toString() })
        val target = LocalDate.parse(archive.date).plusDays(days.toLong())
        if (target.isAfter(today) || target.isBefore(today.minusDays(30))) return
        fetchArchive(archive.kind, target.toString())
    }

    private fun fetchArchive(kind: ArchiveKind, date: String) {
        archiveJob?.cancel()
        archiveJob = viewModelScope.launch {
            _state.update { s ->
                s.copy(archive = s.archive?.copy(loading = true, error = null, date = date))
            }
            try {
                val archive = if (kind == ArchiveKind.Overdue) {
                    TaskRepository.overdue()
                } else {
                    TaskRepository.completed(date)
                }
                _state.update { s ->
                    val current = s.archive
                    if (current == null || current.kind != kind) s
                    else s.copy(
                        archive = current.copy(
                            loading = false,
                            items = archive.items,
                            counts = archive.counts,
                            error = null
                        )
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true, archive = it.archive?.copy(loading = false)) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(archive = it.archive?.copy(loading = false, error = e.message ?: "加载失败"))
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(archive = it.archive?.copy(loading = false, error = "加载失败，请稍后重试"))
                }
            }
        }
    }

    /* ---------------- 内部 ---------------- */

    private fun onActionSuccess(text: String) {
        _state.update {
            it.copy(
                actionBusy = false,
                flash = Flash(text),
                completedSignal = it.completedSignal + 1
            )
        }
        load(refresh = true)
        _state.value.archive?.let { fetchArchive(it.kind, it.date) }
    }

    private fun handleActionError(e: Exception) {
        when (e) {
            is SessionExpiredException -> _state.update {
                it.copy(actionBusy = false, sessionExpired = true)
            }

            is ApiException -> _state.update {
                it.copy(actionBusy = false, flash = Flash(e.message ?: "操作失败", true))
            }

            else -> _state.update {
                it.copy(actionBusy = false, flash = Flash("操作失败，请稍后重试", true))
            }
        }
    }
}
