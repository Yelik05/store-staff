package com.tastien.storestaff.nativeapp.ui.attendance

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.AttendanceMonth
import com.tastien.storestaff.nativeapp.data.AttendanceRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth

data class AttendanceUiState(
    val loading: Boolean = true,
    val month: String = YearMonth.now().toString(),
    val data: AttendanceMonth? = null,
    val error: String? = null,
    val sessionExpired: Boolean = false
)

class AttendanceViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(AttendanceUiState())
    val state = _state.asStateFlow()

    private var job: Job? = null

    init {
        load()
    }

    fun retry() = load()

    fun prevMonth() = shiftMonth(-1)

    fun nextMonth() = shiftMonth(1)

    fun load() {
        job?.cancel()
        val month = _state.value.month
        job = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val data = AttendanceRepository.my(month)
                _state.update {
                    if (it.month != month) it
                    else it.copy(loading = false, data = data, error = null)
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

    private fun shiftMonth(delta: Long) {
        val current = runCatching { YearMonth.parse(_state.value.month) }.getOrDefault(YearMonth.now())
        _state.update {
            it.copy(month = current.plusMonths(delta).toString(), data = null, error = null)
        }
        load()
    }
}
