package com.tastien.storestaff.nativeapp.ui.schedule

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiClient
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.core.text
import com.tastien.storestaff.nativeapp.data.LeaveDayStats
import com.tastien.storestaff.nativeapp.data.LeaveRepository
import com.tastien.storestaff.nativeapp.data.LeaveSummary
import com.tastien.storestaff.nativeapp.data.ShiftRepository
import com.tastien.storestaff.nativeapp.data.ShiftSlot
import com.tastien.storestaff.nativeapp.data.ShiftSummary
import com.tastien.storestaff.nativeapp.data.ShiftToday
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth

data class ScheduleUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val employmentType: String = "",
    val isPartTime: Boolean = false,
    val todayShift: ShiftToday? = null,
    val todayError: String? = null,
    val leave: LeaveSummary? = null,
    val shift: ShiftSummary? = null,
    val dayStats: LeaveDayStats? = null,
    val dayStatsLoading: Boolean = false,
    val dayStatsError: String? = null,
    val actionBusy: Boolean = false,
    val actionSignal: Int = 0,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class ScheduleViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ScheduleUiState())
    val state = _state.asStateFlow()

    private var loadJob: Job? = null
    private var statsJob: Job? = null

    private fun currentMonth(): String = YearMonth.now().toString()

    init {
        load()
    }

    fun load(refresh: Boolean = false) {
        if (loadJob?.isActive == true) return
        loadJob = viewModelScope.launch {
            _state.update {
                it.copy(loading = it.leave == null && it.shift == null, refreshing = refresh, error = null)
            }
            try {
                val month = currentMonth()
                val staff = ApiClient.post("staff.me")
                val employment = staff.text("employmentType")
                val partTime = employment.isNotBlank() && employment != "全职"

                coroutineScope {
                    val shiftToday = async { runCatching { ShiftRepository.today() } }
                    val leaveAsync = async { if (partTime) null else runCatching { LeaveRepository.my(month) } }
                    val shiftAsync = async { if (partTime) runCatching { ShiftRepository.my(month) } else null }

                    val todayResult = shiftToday.await()
                    val leaveResult = leaveAsync.await()
                    val shiftResult = shiftAsync.await()

                    _state.update {
                        it.copy(
                            loading = false,
                            refreshing = false,
                            error = if (leaveResult?.isFailure == true || shiftResult?.isFailure == true) {
                                (leaveResult?.exceptionOrNull() ?: shiftResult?.exceptionOrNull())?.message ?: "加载失败"
                            } else null,
                            employmentType = employment,
                            isPartTime = partTime,
                            todayShift = todayResult.getOrNull(),
                            todayError = todayResult.exceptionOrNull()?.message,
                            leave = leaveResult?.getOrNull(),
                            shift = shiftResult?.getOrNull()
                        )
                    }
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

    fun retry() = load(refresh = true)

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }

    /* ---------------- 当天排休人数 ---------------- */

    fun loadDayStats(date: String) {
        statsJob?.cancel()
        if (date.isBlank()) {
            _state.update { it.copy(dayStats = null, dayStatsLoading = false, dayStatsError = null) }
            return
        }
        statsJob = viewModelScope.launch {
            _state.update { it.copy(dayStatsLoading = true, dayStatsError = null) }
            try {
                val stats = LeaveRepository.dayStats(date)
                _state.update { it.copy(dayStats = stats, dayStatsLoading = false) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(dayStatsLoading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(dayStatsLoading = false, dayStatsError = e.message ?: "排休人数查询失败")
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(dayStatsLoading = false, dayStatsError = "排休人数查询失败")
                }
            }
        }
    }

    fun clearDayStats() {
        statsJob?.cancel()
        _state.update { it.copy(dayStats = null, dayStatsLoading = false, dayStatsError = null) }
    }

    /* ---------------- 提交 / 撤回 ---------------- */

    fun applyLeave(date: String, type: String, reason: String) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                LeaveRepository.apply(date, type, reason)
                onActionSuccess("已提交，等待审批")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    fun applyShift(slots: List<ShiftSlot>, note: String) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                ShiftRepository.apply(slots, note)
                onActionSuccess("排班申请已提交，等待审批")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    fun cancelLeave(id: String, withdraw: Boolean) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                LeaveRepository.cancel(id, if (withdraw) "withdraw" else "cancel")
                onActionSuccess(if (withdraw) "已撤回" else "取消申请已提交，等待店长确认")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    fun cancelShift(id: String, withdraw: Boolean) {
        if (_state.value.actionBusy) return
        viewModelScope.launch {
            _state.update { it.copy(actionBusy = true) }
            try {
                ShiftRepository.cancel(id, if (withdraw) "withdraw" else "cancel")
                onActionSuccess(if (withdraw) "已撤回" else "取消申请已提交，等待店长确认")
            } catch (e: Exception) {
                handleActionError(e)
            }
        }
    }

    /* ---------------- 内部 ---------------- */

    private fun onActionSuccess(text: String) {
        _state.update {
            it.copy(actionBusy = false, flash = Flash(text), actionSignal = it.actionSignal + 1)
        }
        load(refresh = true)
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
