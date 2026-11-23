package com.tastien.storestaff.nativeapp.ui.agenda

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.AgendaItem
import com.tastien.storestaff.nativeapp.data.AgendaRepository
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AgendaUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val scope: String = "mine",
    val canViewAll: Boolean = false,
    val items: List<AgendaItem> = emptyList(),
    val showEditor: Boolean = false,
    val editing: AgendaItem? = null,
    val saving: Boolean = false,
    val deletingId: String? = null,
    val formError: String? = null,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class AgendaViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(AgendaUiState())
    val state = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(loading = it.items.isEmpty(), error = null) }
            try {
                val data = AgendaRepository.list(_state.value.scope)
                _state.update {
                    it.copy(
                        loading = false,
                        items = data.list,
                        canViewAll = data.canViewAll,
                        error = null
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message ?: "日程加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "日程加载失败，请稍后重试") }
            }
        }
    }

    fun retry() = load()

    fun setScope(scope: String) {
        if (scope == _state.value.scope) return
        if (scope == "all" && !_state.value.canViewAll) return
        _state.update { it.copy(scope = scope, items = emptyList(), loading = true, error = null) }
        load()
    }

    fun startCreate() {
        _state.update { it.copy(showEditor = true, editing = null, formError = null) }
    }

    fun startEdit(item: AgendaItem) {
        _state.update { it.copy(showEditor = true, editing = item, formError = null) }
    }

    fun closeEditor() {
        if (_state.value.saving) return
        _state.update { it.copy(showEditor = false, editing = null, formError = null) }
    }

    fun save(
        title: String,
        date: String,
        startTime: String,
        endTime: String,
        location: String,
        remark: String,
        remindMinutes: Int
    ) {
        val current = _state.value
        if (current.saving) return
        val trimmedTitle = title.trim()
        val validation = when {
            trimmedTitle.isEmpty() -> "请填写日程标题"
            date.isBlank() -> "请选择日程日期"
            startTime.isBlank() -> "请选择开始时间"
            endTime.isNotBlank() && endTime <= startTime -> "结束时间需晚于开始时间"
            else -> null
        }
        if (validation != null) {
            _state.update { it.copy(formError = validation) }
            return
        }
        val editing = current.editing
        _state.update { it.copy(saving = true, formError = null) }
        viewModelScope.launch {
            try {
                AgendaRepository.save(
                    id = editing?.id,
                    title = trimmedTitle,
                    date = date,
                    startTime = startTime,
                    endTime = endTime,
                    location = location.trim(),
                    remark = remark.trim(),
                    remindMinutes = remindMinutes,
                    participantIds = editing?.participants?.map { it.id }.orEmpty()
                )
                _state.update {
                    it.copy(
                        saving = false,
                        showEditor = false,
                        editing = null,
                        formError = null,
                        flash = Flash(if (editing == null) "日程已创建" else "日程已更新")
                    )
                }
                load()
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(saving = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(saving = false, formError = e.message ?: "保存失败，请稍后重试")
                }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, formError = "保存失败，请稍后重试") }
            }
        }
    }

    fun remove(item: AgendaItem) {
        if (_state.value.deletingId != null) return
        _state.update { it.copy(deletingId = item.id) }
        viewModelScope.launch {
            try {
                AgendaRepository.remove(item.id)
                _state.update {
                    it.copy(
                        deletingId = null,
                        items = it.items.filterNot { agenda -> agenda.id == item.id },
                        flash = Flash("日程已删除")
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(deletingId = null, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(deletingId = null, flash = Flash(e.message ?: "删除失败", error = true))
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(deletingId = null, flash = Flash("删除失败，请稍后重试", error = true))
                }
            }
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }
}
