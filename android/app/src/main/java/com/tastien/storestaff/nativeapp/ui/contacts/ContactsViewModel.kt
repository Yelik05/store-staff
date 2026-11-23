package com.tastien.storestaff.nativeapp.ui.contacts

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.ContactStaff
import com.tastien.storestaff.nativeapp.data.ContactsRepository
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ContactsUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val list: List<ContactStaff> = emptyList(),
    val storeName: String = "",
    val query: String = "",
    val page: Int = 1,
    val detail: ContactStaff? = null,
    val sending: Boolean = false,
    val sendError: String? = null,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class ContactsViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ContactsUiState())
    val state = _state.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val data = ContactsRepository.contacts()
                _state.update {
                    it.copy(
                        loading = false,
                        list = data.list,
                        storeName = data.storeName,
                        error = null
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message ?: "通讯录加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "通讯录加载失败，请稍后重试") }
            }
        }
    }

    fun retry() = load()

    /** 搜索关键词变化后回到第 1 页。 */
    fun setQuery(query: String) {
        _state.update { it.copy(query = query, page = 1) }
    }

    fun goPage(page: Int) {
        _state.update { it.copy(page = page.coerceAtLeast(1)) }
    }

    fun openDetail(staff: ContactStaff) {
        _state.update { it.copy(detail = staff, sendError = null) }
    }

    fun closeDetail() {
        if (_state.value.sending) return
        _state.update { it.copy(detail = null, sendError = null) }
    }

    fun sendPrivate(body: String) {
        val target = _state.value.detail ?: return
        if (_state.value.sending) return
        val text = body.trim()
        if (text.isEmpty()) {
            _state.update { it.copy(sendError = "请输入私信内容") }
            return
        }
        if (text.length > 500) {
            _state.update { it.copy(sendError = "私信内容不能超过 500 字") }
            return
        }
        _state.update { it.copy(sending = true, sendError = null) }
        viewModelScope.launch {
            try {
                ContactsRepository.sendPrivate(target.id, text)
                _state.update {
                    it.copy(
                        sending = false,
                        detail = null,
                        sendError = null,
                        flash = Flash("私信已发送给 ${target.name.ifBlank { "同事" }}")
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sending = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(sending = false, sendError = e.message ?: "私信发送失败") }
            } catch (e: Exception) {
                _state.update { it.copy(sending = false, sendError = "私信发送失败，请稍后重试") }
            }
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }
}
