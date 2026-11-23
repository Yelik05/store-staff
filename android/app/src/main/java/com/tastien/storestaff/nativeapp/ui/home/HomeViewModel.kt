package com.tastien.storestaff.nativeapp.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.HomeRepository
import com.tastien.storestaff.nativeapp.data.HomeSnapshot
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val snapshot: HomeSnapshot? = null,
    val error: String? = null,
    val sessionExpired: Boolean = false
)

class HomeViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(HomeUiState())
    val state = _state.asStateFlow()

    private var job: Job? = null

    init {
        load()
    }

    fun load(refresh: Boolean = false) {
        if (job?.isActive == true) return
        job = viewModelScope.launch {
            _state.update {
                it.copy(loading = it.snapshot == null, refreshing = refresh, error = null)
            }
            try {
                val snapshot = HomeRepository.load()
                _state.update {
                    it.copy(loading = false, refreshing = false, snapshot = snapshot, error = null)
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
}
