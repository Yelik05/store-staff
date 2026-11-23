package com.tastien.storestaff.nativeapp.ui.salary

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.SalaryDetail
import com.tastien.storestaff.nativeapp.data.SalaryRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SalaryUiState(
    val loading: Boolean = true,
    val months: List<String> = emptyList(),
    val selectedMonth: String? = null,
    val detail: SalaryDetail? = null,
    val detailLoading: Boolean = false,
    val error: String? = null,
    val sessionExpired: Boolean = false
)

class SalaryViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(SalaryUiState())
    val state = _state.asStateFlow()

    private var monthsJob: Job? = null
    private var detailJob: Job? = null

    init {
        load()
    }

    fun retry() {
        val current = _state.value
        if (current.months.isEmpty()) {
            load()
        } else {
            current.selectedMonth?.let { loadDetail(it) }
        }
    }

    fun selectMonth(month: String) {
        val current = _state.value
        if (month == current.selectedMonth && current.detail != null && current.error == null) return
        _state.update { it.copy(selectedMonth = month, detail = null, error = null) }
        loadDetail(month)
    }

    fun load() {
        monthsJob?.cancel()
        detailJob?.cancel()
        monthsJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val months = SalaryRepository.myMonths().sortedDescending()
                if (months.isEmpty()) {
                    _state.update {
                        it.copy(
                            loading = false,
                            months = emptyList(),
                            selectedMonth = null,
                            detail = null,
                            error = null
                        )
                    }
                } else {
                    _state.update {
                        it.copy(
                            loading = false,
                            months = months,
                            selectedMonth = months.first(),
                            detail = null,
                            error = null
                        )
                    }
                    loadDetail(months.first())
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message ?: "加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "加载失败，请稍后重试") }
            }
        }
    }

    private fun loadDetail(month: String) {
        detailJob?.cancel()
        detailJob = viewModelScope.launch {
            _state.update { it.copy(detailLoading = true, error = null) }
            try {
                val detail = SalaryRepository.get(month)
                _state.update {
                    if (it.selectedMonth != month) it
                    else it.copy(detailLoading = false, detail = detail, error = null)
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(detailLoading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(detailLoading = false, error = e.message ?: "加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(detailLoading = false, error = "加载失败，请稍后重试") }
            }
        }
    }
}
