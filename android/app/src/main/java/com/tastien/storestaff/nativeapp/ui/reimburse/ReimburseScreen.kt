package com.tastien.storestaff.nativeapp.ui.reimburse

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.tastien.storestaff.nativeapp.data.ReimbursePayee
import com.tastien.storestaff.nativeapp.data.ReimburseClaim
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.RemoteImage
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.components.fileUrl
import com.tastien.storestaff.nativeapp.ui.components.formatTime
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors

private const val PAGE_SIZE = 20

@Composable
fun ReimburseScreen(state: ReimburseUiState, vm: ReimburseViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    BackHandler(onBack = onBack)
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        ReimburseHeader(state, onBack = onBack, onCreate = { vm.openCreate() })
        FilterRow(state.statusFilter) { vm.setFilter(it) }
        Spacer(Modifier.height(6.dp))

        Box(modifier = Modifier.weight(1f)) {
            when {
                state.loading && state.claims.isEmpty() -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                state.error != null && state.claims.isEmpty() -> ErrorState(state.error, { vm.retry() })

                state.claims.isEmpty() -> EmptyState(
                    title = if (state.statusFilter == ReimburseFilter.All) "还没有报销申请" else "暂无该状态的报销",
                    hint = if (state.statusFilter == ReimburseFilter.All) {
                        "点击右上角「新建」提交报销，审批进度会显示在这里。"
                    } else {
                        "可切换其他状态查看。"
                    }
                )

                else -> ClaimList(state, vm)
            }
        }
    }

    state.detail?.let { claim ->
        ClaimDetailDialog(claim) { vm.closeDetail() }
    }

    if (state.showCreate) {
        CreateClaimDialog(state, vm, onDismiss = { vm.closeCreate() })
    }
}

/* ---------------- 头部与筛选 ---------------- */

@Composable
private fun ReimburseHeader(state: ReimburseUiState, onBack: () -> Unit, onCreate: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "返回",
                tint = MaterialTheme.colorScheme.onSurface
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text("我的报销", style = MaterialTheme.typography.headlineSmall)
            Text(
                if (state.claims.isEmpty()) "提交与审批进度" else "当前 ${state.claims.size} 条记录",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Button(enabled = !state.loading || state.claims.isNotEmpty(), onClick = onCreate) {
            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text("新建")
        }
    }
}

@Composable
private fun FilterRow(selected: ReimburseFilter, onSelect: (ReimburseFilter) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        ReimburseFilter.entries.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text(filter.label, style = MaterialTheme.typography.labelMedium) }
            )
        }
    }
}

/* ---------------- 列表 ---------------- */

@Composable
private fun ClaimList(state: ReimburseUiState, vm: ReimburseViewModel) {
    val pageCount = ((state.claims.size + PAGE_SIZE - 1) / PAGE_SIZE).coerceAtLeast(1)
    val page = state.page.coerceIn(1, pageCount)
    val visible = state.claims.drop((page - 1) * PAGE_SIZE).take(PAGE_SIZE)

    Column(modifier = Modifier.fillMaxSize()) {
        if (state.loading) {
            LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(visible, key = { it.id }) { claim ->
                ClaimCard(claim) { vm.openDetail(claim) }
            }
            item { Spacer(Modifier.height(6.dp)) }
        }
        PagerBar(page, pageCount, state.claims.size) { vm.goPage(it) }
    }
}

@Composable
private fun ClaimCard(claim: ReimburseClaim, onClick: () -> Unit) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(
                    claim.categoryName.ifBlank { "报销" },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.width(8.dp))
                StatusBadge(statusLabel(claim.status), statusKind(claim.status))
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "¥${money(claim.amount)}",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.primary
            )
            if (claim.reason.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    claim.reason,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                formatTime(claim.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (claim.status == "rejected" && claim.rejectReason.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "驳回原因：${claim.rejectReason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.bad
                )
            }
        }
    }
}

@Composable
private fun PagerBar(page: Int, pageCount: Int, total: Int, onPage: (Int) -> Unit) {
    HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(enabled = page > 1, onClick = { onPage(page - 1) }) { Text("上一页") }
        Text(
            "第 $page/$pageCount 页 · 共 $total 条",
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TextButton(enabled = page < pageCount, onClick = { onPage(page + 1) }) { Text("下一页") }
    }
}

/* ---------------- 详情 ---------------- */

@Composable
private fun ClaimDetailDialog(claim: ReimburseClaim, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(claim.categoryName.ifBlank { "报销详情" }) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "¥${money(claim.amount)}",
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(Modifier.width(10.dp))
                    StatusBadge(statusLabel(claim.status), statusKind(claim.status))
                }
                Spacer(Modifier.height(8.dp))
                DetailLine("提交时间", formatTime(claim.createdAt))
                DetailLine("事由", claim.reason.ifBlank { "—" })
                DetailLine("收款方式", payeeTypeLabel(claim.payeeType))
                DetailLine("收款账号", claim.payeeAccount.ifBlank { "—" })
                if (claim.payeeBank.isNotBlank()) DetailLine("开户行", claim.payeeBank)
                DetailLine("收款人", claim.payeeHolder.ifBlank { "—" })
                if (claim.reviewedBy.isNotBlank()) {
                    DetailLine(
                        "审核人",
                        claim.reviewedBy + claim.reviewedAt.takeIf { it.isNotBlank() }
                            ?.let { " · ${formatTime(it)}" }.orEmpty()
                    )
                }
                if (claim.paidAt.isNotBlank()) DetailLine("发放时间", formatTime(claim.paidAt))
                if (claim.rejectReason.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "驳回原因：${claim.rejectReason}",
                        style = MaterialTheme.typography.bodySmall,
                        color = rememberSemanticColors().bad
                    )
                }
                if (claim.attachments.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "附件",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        claim.attachments.forEach { key -> AttachmentThumb(key) }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("关闭") }
        }
    )
}

@Composable
private fun AttachmentThumb(key: String) {
    val url = fileUrl(key) ?: return
    if (url.endsWith(".pdf", ignoreCase = true)) {
        Surface(
            shape = MaterialTheme.shapes.small,
            color = MaterialTheme.colorScheme.surfaceVariant
        ) {
            Text(
                "PDF 附件",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    } else {
        RemoteImage(key, Modifier.size(64.dp))
    }
}

/* ---------------- 新建表单 ---------------- */

@Composable
private fun CreateClaimDialog(state: ReimburseUiState, vm: ReimburseViewModel, onDismiss: () -> Unit) {
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments()
    ) { uris ->
        if (uris.isNotEmpty()) vm.addAttachments(uris)
    }

    var categoryId by remember { mutableStateOf("") }
    var amountText by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var payeeType by remember { mutableStateOf("alipay") }
    var payeeId by remember { mutableStateOf<String?>(null) }
    var account by remember { mutableStateOf("") }
    var bankName by remember { mutableStateOf("") }
    var holderName by remember { mutableStateOf("") }
    var categoryMenu by remember { mutableStateOf(false) }

    LaunchedEffect(state.categories) {
        if (categoryId.isBlank()) categoryId = state.categories.firstOrNull()?.id.orEmpty()
    }

    val selectedCategory = state.categories.firstOrNull { it.id == categoryId }
    val busy = state.submitting || state.uploading

    Dialog(onDismissRequest = { if (!state.submitting) onDismiss() }) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(modifier = Modifier.heightIn(max = 620.dp).padding(18.dp)) {
                Text("新建报销", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(10.dp))

                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                ) {
                    FormLabel("报销分类")
                    Box {
                        OutlinedButton(
                            onClick = { categoryMenu = true },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                selectedCategory?.name
                                    ?: if (state.optionsLoading) "加载分类…" else "选择分类",
                                modifier = Modifier.weight(1f),
                                textAlign = TextAlign.Start,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        DropdownMenu(
                            expanded = categoryMenu,
                            onDismissRequest = { categoryMenu = false }
                        ) {
                            state.categories.forEach { category ->
                                DropdownMenuItem(
                                    text = { Text(category.name) },
                                    onClick = {
                                        categoryId = category.id
                                        categoryMenu = false
                                    }
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FormLabel("金额（元）")
                    OutlinedTextField(
                        value = amountText,
                        onValueChange = { input ->
                            if (input.length <= 10) {
                                amountText = input.filter { it.isDigit() || it == '.' }
                            }
                        },
                        enabled = !busy,
                        placeholder = { Text("0.00") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(10.dp))
                    FormLabel("报销事由")
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { if (it.length <= 200) reason = it },
                        enabled = !busy,
                        placeholder = { Text("请说明费用用途（至少 2 个字）") },
                        maxLines = 3,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (state.payees.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        FormLabel("常用收款账户")
                        Row(
                            modifier = Modifier.horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            state.payees.forEach { payee ->
                                FilterChip(
                                    selected = payeeId == payee.id,
                                    enabled = !busy,
                                    onClick = {
                                        payeeId = payee.id
                                        payeeType = payee.type.ifBlank { "alipay" }
                                        account = payee.account
                                        bankName = payee.bankName
                                        holderName = payee.holderName
                                    },
                                    label = { Text(payeeLabel(payee)) }
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FormLabel("收款方式")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("alipay" to "支付宝", "bank" to "银行卡").forEach { (value, label) ->
                            FilterChip(
                                selected = payeeType == value,
                                enabled = !busy,
                                onClick = { payeeType = value },
                                label = { Text(label) }
                            )
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FormLabel("收款账号")
                    OutlinedTextField(
                        value = account,
                        onValueChange = {
                            account = it
                            payeeId = null
                        },
                        enabled = !busy,
                        placeholder = { Text(if (payeeType == "bank") "银行卡号" else "支付宝账号") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (payeeType == "bank") {
                        Spacer(Modifier.height(10.dp))
                        FormLabel("开户行")
                        OutlinedTextField(
                            value = bankName,
                            onValueChange = {
                                bankName = it
                                payeeId = null
                            },
                            enabled = !busy,
                            placeholder = { Text("如：中国工商银行 XX 支行") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }

                    Spacer(Modifier.height(10.dp))
                    FormLabel("收款人姓名")
                    OutlinedTextField(
                        value = holderName,
                        onValueChange = {
                            holderName = it
                            payeeId = null
                        },
                        enabled = !busy,
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(14.dp))
                    FormLabel("附件")
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(
                            enabled = !busy && state.attachments.size < MAX_ATTACHMENTS,
                            onClick = {
                                picker.launch(
                                    arrayOf(
                                        "image/jpeg",
                                        "image/png",
                                        "image/webp",
                                        "application/pdf"
                                    )
                                )
                            }
                        ) {
                            Icon(
                                Icons.Outlined.AttachFile,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                if (state.attachments.isEmpty()) "选择附件"
                                else "继续添加（${state.attachments.size}/$MAX_ATTACHMENTS）"
                            )
                        }
                        if (state.uploading) {
                            Spacer(Modifier.width(10.dp))
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                        }
                    }
                    Text(
                        "支持 JPG / PNG / WEBP / PDF，单个不超过 10MB，最多 $MAX_ATTACHMENTS 个。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    state.attachments.forEach { attachment ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                attachment.name,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            TextButton(
                                enabled = !busy,
                                onClick = { vm.removeAttachment(attachment.key) }
                            ) { Text("移除") }
                        }
                    }
                }

                state.formError?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(enabled = !state.submitting, onClick = onDismiss) { Text("取消") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        enabled = !busy,
                        onClick = {
                            vm.submitForm(
                                categoryId = categoryId,
                                amountText = amountText,
                                reason = reason,
                                payeeType = payeeType,
                                account = account,
                                bankName = bankName,
                                holderName = holderName,
                                payeeId = payeeId
                            )
                        }
                    ) {
                        Text(if (state.submitting) "提交中…" else "提交")
                    }
                }
            }
        }
    }
}

/* ---------------- 小部件 ---------------- */

@Composable
private fun FormLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun DetailLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(
            label,
            modifier = Modifier.width(60.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
    }
}

private const val MAX_ATTACHMENTS = 5

private fun money(value: Double): String = "%.2f".format(value)

private fun statusLabel(status: String): String = when (status) {
    "pending" -> "待审核"
    "approved" -> "已通过"
    "rejected" -> "已驳回"
    "paid" -> "已发放"
    else -> status.ifBlank { "待审核" }
}

private fun statusKind(status: String): BadgeKind = when (status) {
    "approved" -> BadgeKind.Ok
    "paid" -> BadgeKind.Info
    "rejected" -> BadgeKind.Bad
    else -> BadgeKind.Warn
}

private fun payeeTypeLabel(type: String): String = when (type) {
    "bank" -> "银行卡"
    "alipay" -> "支付宝"
    else -> type.ifBlank { "—" }
}

private fun payeeLabel(payee: ReimbursePayee): String {
    val type = if (payee.type == "bank") "银行卡" else "支付宝"
    val tail = payee.account.takeLast(4)
    return if (tail.isBlank()) type else "$type · $tail"
}
