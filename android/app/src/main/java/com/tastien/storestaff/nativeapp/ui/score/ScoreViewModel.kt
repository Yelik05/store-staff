package com.tastien.storestaff.nativeapp.ui.score

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.ScoreDimensionDef
import com.tastien.storestaff.nativeapp.data.ScoreRecord
import com.tastien.storestaff.nativeapp.data.ScoreRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ScoreUiState(
    val loading: Boolean = true,
    val months: List<String> = emptyList(),
    val selectedMonth: String? = null,
    val record: ScoreRecord? = null,
    val dimensions: List<ScoreDimensionDef> = emptyList(),
    val detailLoading: Boolean = false,
    val error: String? = null,
    val sessionExpired: Boolean = false
)

class ScoreViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ScoreUiState())
    val state = _state.asStateFlow()

    private var loadJob: Job? = null
    private var recordJob: Job? = null

    init {
        load()
    }

    fun retry() {
        val current = _state.value
        if (current.months.isEmpty()) {
            load()
        } else {
            current.selectedMonth?.let { loadRecord(it) }
        }
    }

    fun selectMonth(month: String) {
        val current = _state.value
        if (month == current.selectedMonth && current.record != null && current.error == null) return
        _state.update { it.copy(selectedMonth = month, record = null, error = null) }
        loadRecord(month)
    }

    fun load() {
        loadJob?.cancel()
        recordJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val records = ScoreRepository.my()
                val dims = try {
                    ScoreRepository.dimensions()
                } catch (e: SessionExpiredException) {
                    throw e
                } catch (e: Exception) {
                    emptyList()
                }
                val months = records
                    .map { it.month }
                    .filter { it.isNotBlank() }
                    .distinct()
                    .sortedDescending()
                _state.update {
                    it.copy(
                        loading = false,
                        months = months,
                        selectedMonth = months.firstOrNull(),
                        record = null,
                        dimensions = dims,
                        error = null
                    )
                }
                months.firstOrNull()?.let { loadRecord(it) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(loading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update { it.copy(loading = false, error = e.message ?: "加载失败") }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = "加载失败，请稍后重试") }
            }
        }
    }

    private fun loadRecord(month: String) {
        recordJob?.cancel()
        recordJob = viewModelScope.launch {
            _state.update { it.copy(detailLoading = true, error = null) }
            try {
                val record = ScoreRepository.get(month)
                _state.update {
                    if (it.selectedMonth != month) it
                    else it.copy(detailLoading = false, record = record, error = null)
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
