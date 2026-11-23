package com.tastien.storestaff.nativeapp.ui.expiry

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.ExpiryCheckData
import com.tastien.storestaff.nativeapp.data.ExpiryMaterial
import com.tastien.storestaff.nativeapp.data.ExpiryRecord
import com.tastien.storestaff.nativeapp.data.ExpiryRepository
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime

enum class ExpiryTab(val label: String) {
    Check("效期检查"),
    Due("当天到期"),
    Day("效期总览")
}

enum class SaveStatus { Idle, Saving, Saved, Failed }

data class MaterialSaveUi(
    val value: String = "",
    val status: SaveStatus = SaveStatus.Idle,
    val message: String = "",
    val scrap: Boolean = false
)

data class PendingScan(
    val raw: String = "",
    val name: String = "",
    val date: String = "",
    val time: String = "",
    val timeError: String = "",
    val materialId: String = "",
    val saved: Boolean = false,
    val dueText: String = "",
    val scrapNeeded: Boolean = false
)

data class ExpiryUiState(
    val tab: ExpiryTab = ExpiryTab.Check,
    val checkDate: String = LocalDate.now().toString(),
    val dueDate: String = LocalDate.now().toString(),
    val dayDate: String = LocalDate.now().toString(),
    val check: ExpiryCheckData? = null,
    val checkLoading: Boolean = true,
    val checkError: String? = null,
    val materialStates: Map<String, MaterialSaveUi> = emptyMap(),
    /* 扫码识别结果：跨页面/弹窗关闭保留，确认或完整保存前不被下一条覆盖 */
    val pendingScan: PendingScan? = null,
    val dueList: List<ExpiryRecord>? = null,
    val dueLoading: Boolean = false,
    val dueError: String? = null,
    val processingIds: Set<String> = emptySet(),
    val dayList: List<ExpiryRecord>? = null,
    val dayLoading: Boolean = false,
    val dayError: String? = null,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class ExpiryViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ExpiryUiState())
    val state = _state.asStateFlow()

    private var checkJob: Job? = null
    private var dueJob: Job? = null
    private var dayJob: Job? = null

    init {
        loadCheck()
    }

    fun selectTab(tab: ExpiryTab) {
        _state.update { it.copy(tab = tab) }
        when (tab) {
            ExpiryTab.Check -> if (_state.value.check == null) loadCheck() else Unit
            ExpiryTab.Due -> if (_state.value.dueList == null) loadDue() else Unit
            ExpiryTab.Day -> if (_state.value.dayList == null) loadDay() else Unit
        }
    }

    fun setCheckDate(date: String) {
        if (date == _state.value.checkDate) return
        _state.update {
            it.copy(
                checkDate = date,
                check = null,
                checkError = null,
                materialStates = emptyMap(),
                pendingScan = null
            )
        }
        loadCheck()
    }

    fun setDueDate(date: String) {
        if (date == _state.value.dueDate) return
        _state.update { it.copy(dueDate = date, dueList = null, dueError = null) }
        loadDue()
    }

    fun setDayDate(date: String) {
        if (date == _state.value.dayDate) return
        _state.update { it.copy(dayDate = date, dayList = null, dayError = null) }
        loadDay()
    }

    fun loadCheck() {
        if (checkJob?.isActive == true) return
        checkJob = viewModelScope.launch {
            _state.update { it.copy(checkLoading = it.check == null, checkError = null) }
            try {
                val data = ExpiryRepository.checkData(_state.value.checkDate)
                _state.update { st ->
                    st.copy(
                        check = data,
                        checkLoading = false,
                        checkError = null,
                        materialStates = st.materialStates.filterKeys { id ->
                            data.materials.any { it.id == id }
                        }
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(checkLoading = false, sessionExpired = true) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(checkLoading = false, checkError = readable(e))
                }
            }
        }
    }

    fun loadDue() {
        if (dueJob?.isActive == true) return
        dueJob = viewModelScope.launch {
            _state.update { it.copy(dueLoading = it.dueList == null, dueError = null) }
            try {
                val list = ExpiryRepository.dueList(_state.value.dueDate)
                _state.update { it.copy(dueList = list, dueLoading = false, dueError = null) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(dueLoading = false, sessionExpired = true) }
            } catch (e: Exception) {
                _state.update { it.copy(dueLoading = false, dueError = readable(e)) }
            }
        }
    }

    fun loadDay() {
        if (dayJob?.isActive == true) return
        dayJob = viewModelScope.launch {
            _state.update { it.copy(dayLoading = it.dayList == null, dayError = null) }
            try {
                val list = ExpiryRepository.dayList(_state.value.dayDate)
                _state.update { it.copy(dayList = list, dayLoading = false, dayError = null) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(dayLoading = false, sessionExpired = true) }
            } catch (e: Exception) {
                _state.update { it.copy(dayLoading = false, dayError = readable(e)) }
            }
        }
    }

    /**
     * 扫码结果入口：完整匹配（物料 + 未过期时间）自动保存；未完整或已过期则固定为待确认结果。
     * 未确认结果存在时忽略后续扫码，避免被下一条覆盖。
     */
    fun offerScan(parsed: QrResult, materials: List<ExpiryMaterial>) {
        val st = _state.value
        val current = st.pendingScan
        if (current != null && !current.saved) return
        if (current != null && current.saved && current.raw == parsed.raw) return
        if (parsed.raw.isBlank()) return

        val closeTime = st.check?.closeTime ?: "23:00"
        val matched = matchMaterial(parsed.name, materials)
        val closeDue = matched?.closeDue == true
        val time = parsed.time

        if (matched != null && parsed.date.isNotBlank() && (closeDue || time.isNotBlank())) {
            val due = formatDueValue(parsed.date, if (closeDue) "" else time, closeDue)
            val dueAt = parseDueAt(due, closeTime)
            val future = dueAt != null && dueAt.isAfter(LocalDateTime.now())
            _state.update {
                it.copy(
                    pendingScan = PendingScan(
                        raw = parsed.raw,
                        name = parsed.name.ifBlank { matched.name },
                        date = parsed.date,
                        time = if (closeDue) "" else time,
                        materialId = matched.id,
                        saved = false,
                        dueText = due,
                        scrapNeeded = !future
                    )
                )
            }
            if (future) saveMaterial(matched, due, pendingRaw = parsed.raw)
            return
        }

        _state.update {
            it.copy(
                pendingScan = PendingScan(
                    raw = parsed.raw,
                    name = parsed.name,
                    date = parsed.date,
                    time = time,
                    timeError = parsed.timeError,
                    materialId = matched?.id.orEmpty()
                )
            )
        }
    }

    fun updatePendingMaterial(materialId: String) {
        _state.update { st ->
            st.pendingScan?.let { st.copy(pendingScan = it.copy(materialId = materialId)) } ?: st
        }
    }

    fun updatePendingTime(time: String) {
        _state.update { st ->
            st.pendingScan?.let {
                st.copy(pendingScan = it.copy(time = time.take(5), scrapNeeded = false))
            } ?: st
        }
    }

    fun clearPendingScan() {
        _state.update { it.copy(pendingScan = null) }
    }

    /** 确认保存待处理结果；已过期需二次确认（scrapNeeded）。 */
    fun confirmPendingScan() {
        val st = _state.value
        val pending = st.pendingScan ?: return
        if (pending.saved) return
        val material = st.check?.materials?.firstOrNull { it.id == pending.materialId } ?: return
        if (pending.date.isBlank()) return
        val closeDue = material.closeDue
        if (!closeDue && pending.time.length != 5) return
        val due = formatDueValue(pending.date, if (closeDue) "" else pending.time, closeDue)
        val dueAt = parseDueAt(due, st.check?.closeTime ?: "23:00")
        val past = pending.scrapNeeded || (dueAt != null && !dueAt.isAfter(LocalDateTime.now()))

        if (past && !pending.scrapNeeded) {
            _state.update { it.copy(pendingScan = pending.copy(scrapNeeded = true, dueText = due)) }
            return
        }
        saveMaterial(material, due, scrap = past, pendingRaw = pending.raw)
    }

    fun retryPendingSave() {
        val pending = _state.value.pendingScan ?: return
        val material = _state.value.check?.materials?.firstOrNull { it.id == pending.materialId } ?: return
        if (pending.dueText.isBlank()) return
        saveMaterial(
            material,
            pending.dueText,
            scrap = pending.scrapNeeded,
            pendingRaw = pending.raw
        )
    }

    /**
     * 录入到期时间即时保存。
     * @param dueText 打烊到期为 yyyy-MM-dd；其余为 yyyy-MM-dd HH:mm
     * @param scrap 已过期时间需显式按报废登记
     * @param pendingRaw 扫码来源标记：保存结果回写待确认面板
     */
    fun saveMaterial(
        material: ExpiryMaterial,
        dueText: String,
        scrap: Boolean = false,
        pendingRaw: String? = null
    ) {
        val value = dueText.trim()
        if (value.isEmpty()) return
        val current = _state.value.materialStates[material.id]
        if (current?.status == SaveStatus.Saving) return

        _state.update {
            it.copy(
                materialStates = it.materialStates +
                    (material.id to MaterialSaveUi(value, SaveStatus.Saving, "", scrap))
            )
        }
        viewModelScope.launch {
            try {
                ExpiryRepository.checkSave(_state.value.checkDate, material.id, value, scrap)
                _state.update { st ->
                    val normalized = normalizeDue(material, value, st.check?.closeTime ?: "23:00")
                    val pending = st.pendingScan
                    st.copy(
                        check = st.check?.let { data -> data.withRecord(material, normalized, scrap) },
                        materialStates = st.materialStates +
                            (material.id to MaterialSaveUi(value, SaveStatus.Saved, "", scrap)),
                        pendingScan = if (pending != null && pendingRaw != null && pending.raw == pendingRaw) {
                            pending.copy(
                                saved = true,
                                scrapNeeded = false,
                                dueText = normalized,
                                materialId = material.id,
                                name = pending.name.ifBlank { material.name }
                            )
                        } else pending
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true) }
            } catch (e: Exception) {
                val message = readable(e)
                _state.update {
                    it.copy(
                        materialStates = it.materialStates +
                            (material.id to MaterialSaveUi(value, SaveStatus.Failed, message, scrap)),
                        pendingScan = it.pendingScan?.let { p ->
                            if (pendingRaw != null && p.raw == pendingRaw) p.copy(saved = false) else p
                        }
                    )
                }
            }
        }
    }

    fun retryMaterial(material: ExpiryMaterial) {
        val pending = _state.value.materialStates[material.id] ?: return
        if (pending.status != SaveStatus.Failed || pending.value.isBlank()) return
        saveMaterial(material, pending.value, pending.scrap)
    }

    fun processRecord(record: ExpiryRecord) {
        if (record.id.isBlank() || record.id in _state.value.processingIds) return
        _state.update { it.copy(processingIds = it.processingIds + record.id) }
        viewModelScope.launch {
            try {
                val updated = ExpiryRepository.process(record.id)
                _state.update { st ->
                    st.copy(
                        dueList = st.dueList?.map { if (it.id == record.id) updated ?: it else it },
                        dayList = st.dayList?.map { if (it.id == record.id) updated ?: it else it },
                        processingIds = st.processingIds - record.id,
                        flash = Flash("${record.materialName} 已标记处理")
                    )
                }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(sessionExpired = true, processingIds = it.processingIds - record.id) }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        processingIds = it.processingIds - record.id,
                        flash = Flash(readable(e), error = true)
                    )
                }
            }
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }

    private fun readable(e: Exception): String = when (e) {
        is ApiException -> e.message?.ifBlank { "请求失败，请稍后重试" } ?: "请求失败，请稍后重试"
        else -> e.message?.ifBlank { "网络异常，请稍后重试" } ?: "网络异常，请稍后重试"
    }

    /** 打烊到期服务端补打烊时刻；手动选择保持用户选择。 */
    private fun normalizeDue(material: ExpiryMaterial, value: String, closeTime: String): String =
        if (material.closeDue) value.take(10) + " " + closeTime else value.replace('T', ' ').take(16)

    private fun ExpiryCheckData.withRecord(
        material: ExpiryMaterial,
        dueAt: String,
        scrap: Boolean
    ): ExpiryCheckData {
        val record = ExpiryRecord(
            id = material.record?.id.orEmpty(),
            materialId = material.id,
            categoryId = material.categoryId,
            materialName = material.name,
            categoryName = categories.firstOrNull { it.id == material.categoryId }?.name ?: "",
            checkDate = date,
            dueAt = dueAt,
            note = material.record?.note.orEmpty(),
            status = if (scrap) "scrapped" else "normal",
            processedBy = material.record?.processedBy.orEmpty(),
            processedAt = material.record?.processedAt.orEmpty(),
            createdBy = material.record?.createdBy.orEmpty()
        )
        return copy(
            categories = categories.map { category ->
                category.copy(
                    materials = category.materials.map { m ->
                        if (m.id == material.id) m.copy(record = record) else m
                    }
                )
            }
        )
    }
}
