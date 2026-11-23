package com.tastien.storestaff.nativeapp.ui.reimburse

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.data.ReimburseAttachment
import com.tastien.storestaff.nativeapp.data.ReimburseCategory
import com.tastien.storestaff.nativeapp.data.ReimburseClaim
import com.tastien.storestaff.nativeapp.data.ReimbursePayee
import com.tastien.storestaff.nativeapp.data.ReimburseRepository
import com.tastien.storestaff.nativeapp.ui.tasks.Flash
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val PAGE_SIZE = 20
private const val MAX_ATTACHMENTS = 5

/** 状态筛选：api 为空表示不带 status 参数（全部）。 */
enum class ReimburseFilter(val label: String, val api: String?) {
    All("全部", null),
    Pending("待审核", "pending"),
    Approved("已通过", "approved"),
    Rejected("已驳回", "rejected"),
    Paid("已发放", "paid")
}

data class ReimburseUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val claims: List<ReimburseClaim> = emptyList(),
    val statusFilter: ReimburseFilter = ReimburseFilter.All,
    val page: Int = 1,
    val detail: ReimburseClaim? = null,
    val showCreate: Boolean = false,
    val categories: List<ReimburseCategory> = emptyList(),
    val payees: List<ReimbursePayee> = emptyList(),
    val optionsLoading: Boolean = false,
    val attachments: List<ReimburseAttachment> = emptyList(),
    val uploading: Boolean = false,
    val submitting: Boolean = false,
    val formError: String? = null,
    val flash: Flash? = null,
    val sessionExpired: Boolean = false
)

class ReimburseViewModel(app: Application) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ReimburseUiState())
    val state = _state.asStateFlow()

    private var loadJob: Job? = null
    private var optionsJob: Job? = null

    init {
        load()
    }

    fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            try {
                val list = ReimburseRepository.my(_state.value.statusFilter.api)
                _state.update {
                    it.copy(
                        loading = false,
                        claims = list,
                        error = null,
                        page = it.page.coerceIn(1, pageCount(list.size))
                    )
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

    fun retry() = load()

    fun setFilter(filter: ReimburseFilter) {
        if (filter == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = filter, page = 1, claims = emptyList(), error = null) }
        load()
    }

    fun goPage(page: Int) {
        _state.update { it.copy(page = page.coerceIn(1, pageCount(it.claims.size))) }
    }

    fun openDetail(claim: ReimburseClaim) {
        _state.update { it.copy(detail = claim) }
    }

    fun closeDetail() {
        _state.update { it.copy(detail = null) }
    }

    fun openCreate() {
        _state.update { it.copy(showCreate = true, formError = null, attachments = emptyList()) }
        if (_state.value.categories.isEmpty() || _state.value.payees.isEmpty()) {
            loadFormOptions()
        }
    }

    fun closeCreate() {
        if (_state.value.submitting || _state.value.uploading) return
        _state.update { it.copy(showCreate = false, formError = null) }
    }

    /** 选择附件后立即上传，成功后在表单中显示文件名。 */
    fun addAttachments(uris: List<Uri>) {
        val current = _state.value
        if (current.uploading) return
        val remaining = MAX_ATTACHMENTS - current.attachments.size
        if (remaining <= 0) {
            _state.update { it.copy(flash = Flash("最多上传 5 个附件", true)) }
            return
        }
        if (uris.isEmpty()) return
        if (uris.size > remaining) {
            _state.update { it.copy(flash = Flash("最多上传 5 个附件，已按上限保留", true)) }
        }
        val picked = uris.take(remaining).distinct()
        viewModelScope.launch {
            _state.update { it.copy(uploading = true, formError = null) }
            var failure: String? = null
            for (uri in picked) {
                try {
                    val uploaded = ReimburseRepository.uploadAttachment(getApplication<Application>(), uri)
                    _state.update { it.copy(attachments = it.attachments + uploaded) }
                } catch (e: SessionExpiredException) {
                    _state.update { it.copy(uploading = false, sessionExpired = true) }
                    return@launch
                } catch (e: Exception) {
                    failure = e.message?.ifBlank { "附件上传失败，请重试" } ?: "附件上传失败，请重试"
                }
            }
            _state.update { it.copy(uploading = false, formError = failure ?: it.formError) }
        }
    }

    fun removeAttachment(key: String) {
        _state.update { it.copy(attachments = it.attachments.filterNot { it.key == key }) }
    }

    fun submitForm(
        categoryId: String,
        amountText: String,
        reason: String,
        payeeType: String,
        account: String,
        bankName: String,
        holderName: String,
        payeeId: String?
    ) {
        val current = _state.value
        if (current.submitting) return
        if (current.uploading) {
            _state.update { it.copy(formError = "附件正在上传，请稍候再提交") }
            return
        }
        val amount = amountText.trim().toDoubleOrNull()
        val validation = when {
            categoryId.isBlank() -> "请选择报销分类"
            amount == null || amount <= 0.0 -> "请输入正确的报销金额"
            reason.trim().length < 2 -> "报销事由至少 2 个字"
            account.trim().isBlank() -> "请填写收款账号"
            holderName.trim().isBlank() -> "请填写收款人姓名"
            payeeType == "bank" && bankName.trim().isBlank() -> "请填写开户行"
            else -> null
        }
        if (validation != null) {
            _state.update { it.copy(formError = validation) }
            return
        }
        _state.update { it.copy(submitting = true, formError = null) }
        val attachmentKeys = current.attachments.map { it.key }
        viewModelScope.launch {
            try {
                ReimburseRepository.create(
                    categoryId = categoryId,
                    amount = amount ?: 0.0,
                    reason = reason.trim(),
                    attachments = attachmentKeys,
                    payeeId = payeeId,
                    type = payeeType,
                    account = account.trim(),
                    bankName = bankName.trim(),
                    holderName = holderName.trim()
                )
                _state.update {
                    it.copy(
                        submitting = false,
                        showCreate = false,
                        attachments = emptyList(),
                        formError = null,
                        statusFilter = ReimburseFilter.All,
                        page = 1,
                        claims = emptyList(),
                        flash = Flash("报销申请已提交")
                    )
                }
                load()
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(submitting = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(submitting = false, formError = e.message ?: "提交失败，请稍后重试")
                }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, formError = "提交失败，请稍后重试") }
            }
        }
    }

    fun clearFlash() {
        _state.update { it.copy(flash = null) }
    }

    private fun loadFormOptions() {
        if (optionsJob?.isActive == true) return
        optionsJob = viewModelScope.launch {
            _state.update { it.copy(optionsLoading = true) }
            try {
                val categories = _state.value.categories.ifEmpty { ReimburseRepository.categories() }
                val payees = _state.value.payees.ifEmpty { ReimburseRepository.payees() }
                _state.update { it.copy(categories = categories, payees = payees, optionsLoading = false) }
            } catch (e: SessionExpiredException) {
                _state.update { it.copy(optionsLoading = false, sessionExpired = true) }
            } catch (e: ApiException) {
                _state.update {
                    it.copy(optionsLoading = false, formError = e.message ?: "分类与收款账户加载失败")
                }
            } catch (e: Exception) {
                _state.update { it.copy(optionsLoading = false, formError = "分类与收款账户加载失败，请重试") }
            }
        }
    }

    private fun pageCount(total: Int): Int =
        if (total <= 0) 1 else (total + PAGE_SIZE - 1) / PAGE_SIZE
}
