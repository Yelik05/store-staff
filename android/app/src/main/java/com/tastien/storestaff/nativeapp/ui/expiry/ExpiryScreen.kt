package com.tastien.storestaff.nativeapp.ui.expiry

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tastien.storestaff.nativeapp.data.ExpiryCategory
import com.tastien.storestaff.nativeapp.data.ExpiryMaterial
import com.tastien.storestaff.nativeapp.data.ExpiryRecord
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExpiryScreen(
    state: ExpiryUiState,
    vm: ExpiryViewModel,
    autoOpenScanner: Boolean = false,
    onAutoOpenConsumed: () -> Unit = {}
) {
    val context = LocalContext.current
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    var showScanner by remember { mutableStateOf(false) }
    LaunchedEffect(autoOpenScanner) {
        if (autoOpenScanner) {
            showScanner = true
            onAutoOpenConsumed()
        }
    }
    var datePickerTarget by remember { mutableStateOf<DatePickerTarget?>(null) }
    var timePickerTarget by remember { mutableStateOf<Pair<ExpiryMaterial, String>?>(null) }
    var scrapTarget by remember { mutableStateOf<Pair<ExpiryMaterial, String>?>(null) }
    var processTarget by remember { mutableStateOf<ExpiryRecord?>(null) }

    val closeTime = state.check?.closeTime ?: "23:00"

    fun applyDue(material: ExpiryMaterial, dueText: String) {
        val due = parseDueAt(dueText, closeTime)
        if (due != null && !due.isAfter(LocalDateTime.now())) {
            scrapTarget = material to dueText
        } else {
            vm.saveMaterial(material, dueText)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("效期", style = MaterialTheme.typography.headlineSmall)
                Text(
                    "登记原物料到期时间，到期前及时处理",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = {
                when (state.tab) {
                    ExpiryTab.Check -> vm.loadCheck()
                    ExpiryTab.Due -> vm.loadDue()
                    ExpiryTab.Day -> vm.loadDay()
                }
            }) {
                Icon(
                    Icons.Outlined.Refresh,
                    contentDescription = "刷新",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        ExpiryTabs(state.tab) { vm.selectTab(it) }
        Spacer(Modifier.height(4.dp))

        Box(modifier = Modifier.weight(1f)) {
            when (state.tab) {
                ExpiryTab.Check -> CheckTab(
                    state = state,
                    onPickDate = { datePickerTarget = DatePickerTarget.Check },
                    onScan = { showScanner = true },
                    onEditMaterial = { material ->
                        val saved = material.record?.dueAt.orEmpty()
                        datePickerTarget = DatePickerTarget.Material(material, saved)
                    },
                    onRetry = { vm.retryMaterial(it) },
                    onReload = { vm.loadCheck() },
                    onResumePending = { showScanner = true },
                    onClearPending = { vm.clearPendingScan() },
                    onRetryPending = { vm.retryPendingSave() }
                )

                ExpiryTab.Due -> DueTab(
                    state = state,
                    onPickDate = { datePickerTarget = DatePickerTarget.Due },
                    onProcess = { processTarget = it },
                    onRetry = { vm.loadDue() }
                )

                ExpiryTab.Day -> DayTab(
                    state = state,
                    onPickDate = { datePickerTarget = DatePickerTarget.Day },
                    onRetry = { vm.loadDay() }
                )
            }
        }
    }

    if (showScanner) {
        val materials = state.check?.materials.orEmpty()
        if (materials.isNotEmpty()) {
            val pending = state.pendingScan
            ExpiryScannerDialog(
                materials = materials,
                closeTime = closeTime,
                pending = pending,
                pendingSave = pending?.materialId?.let { state.materialStates[it] },
                onOffer = { vm.offerScan(it, materials) },
                onSelectMaterial = { vm.updatePendingMaterial(it) },
                onTimeChange = { vm.updatePendingTime(it) },
                onConfirmPending = { vm.confirmPendingScan() },
                onClearPending = { vm.clearPendingScan() },
                onRetryPending = { vm.retryPendingSave() },
                onManualSave = { material, dueText -> applyDue(material, dueText) },
                onDismiss = { showScanner = false }
            )
        }
    }

    /* 关闭扫码后仍保留识别结果，回到「效期检查」顶部可继续处理 */



    datePickerTarget?.let { target ->
        val initialMillis = when (target) {
            is DatePickerTarget.Material ->
                (parseDate(target.savedDue) ?: parseDate(state.checkDate) ?: LocalDate.now())
                    .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            DatePickerTarget.Check -> (parseDate(state.checkDate) ?: LocalDate.now())
                .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            DatePickerTarget.Due -> (parseDate(state.dueDate) ?: LocalDate.now())
                .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
            DatePickerTarget.Day -> (parseDate(state.dayDate) ?: LocalDate.now())
                .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        val title = when (target) {
            is DatePickerTarget.Material -> "选择到期日期"
            DatePickerTarget.Check -> "检查日期"
            DatePickerTarget.Due -> "到期日期"
            DatePickerTarget.Day -> "登记日期"
        }
        DatePickerDialog(
            onDismissRequest = { datePickerTarget = null },
            confirmButton = {
                TextButton(onClick = {
                    val millis = pickerState.selectedDateMillis
                    val date = millis?.let {
                        Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()
                    }
                    if (!date.isNullOrBlank()) {
                        when (target) {
                            is DatePickerTarget.Material -> {
                                if (target.material.closeDue) {
                                    vm.saveMaterial(target.material, date)
                                } else {
                                    timePickerTarget = target.material to date
                                }
                            }
                            DatePickerTarget.Check -> vm.setCheckDate(date)
                            DatePickerTarget.Due -> vm.setDueDate(date)
                            DatePickerTarget.Day -> vm.setDayDate(date)
                        }
                    }
                    datePickerTarget = null
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { datePickerTarget = null }) { Text("取消") }
            }
        ) {
            DatePicker(state = pickerState, title = { Text(title, modifier = Modifier.padding(16.dp)) })
        }
    }

    timePickerTarget?.let { (material, date) ->
        val savedTime = parseTimeFromDue(material.record?.dueAt.orEmpty())
        val initial = savedTime ?: defaultTimeOf(material)
        val timeState = rememberTimePickerState(
            initialHour = initial.first,
            initialMinute = initial.second,
            is24Hour = true
        )
        AlertDialog(
            onDismissRequest = { timePickerTarget = null },
            title = { Text("选择「${material.name}」到期时间") },
            text = { TimePicker(state = timeState) },
            confirmButton = {
                TextButton(onClick = {
                    val dueText = "%s %02d:%02d".format(date, timeState.hour, timeState.minute)
                    timePickerTarget = null
                    applyDue(material, dueText)
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { timePickerTarget = null }) { Text("取消") }
            }
        )
    }

    scrapTarget?.let { (material, dueText) ->
        AlertDialog(
            onDismissRequest = { scrapTarget = null },
            title = { Text("该效期已过期") },
            text = {
                Text("「${material.name}」$dueText 已过期，确认后将按「已报废」状态登记，操作不可撤销。")
            },
            confirmButton = {
                TextButton(onClick = {
                    scrapTarget = null
                    vm.saveMaterial(material, dueText, scrap = true)
                }) { Text("确认已报废", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { scrapTarget = null }) { Text("返回修改") }
            }
        )
    }

    processTarget?.let { record ->
        AlertDialog(
            onDismissRequest = { processTarget = null },
            title = { Text("确认已处理") },
            text = { Text("确认将「${record.materialName}」标记为已处理？标记后不可撤销。") },
            confirmButton = {
                TextButton(onClick = {
                    processTarget = null
                    vm.processRecord(record)
                }) { Text("标记已处理") }
            },
            dismissButton = {
                TextButton(onClick = { processTarget = null }) { Text("取消") }
            }
        )
    }
}

private sealed interface DatePickerTarget {
    data class Material(val material: ExpiryMaterial, val savedDue: String) : DatePickerTarget
    data object Check : DatePickerTarget
    data object Due : DatePickerTarget
    data object Day : DatePickerTarget
}

/* ---------------- 顶部 TAB ---------------- */

@Composable
private fun ExpiryTabs(selected: ExpiryTab, onSelect: (ExpiryTab) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        ExpiryTab.entries.forEach { tab ->
            val active = tab == selected
            Surface(
                modifier = Modifier.weight(1f).clickable { onSelect(tab) },
                shape = MaterialTheme.shapes.small,
                color = if (active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                contentColor = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            ) {
                Box(modifier = Modifier.padding(vertical = 9.dp), contentAlignment = Alignment.Center) {
                    Text(tab.label, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

/* ---------------- TAB 1：效期检查 ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CheckTab(
    state: ExpiryUiState,
    onPickDate: () -> Unit,
    onScan: () -> Unit,
    onEditMaterial: (ExpiryMaterial) -> Unit,
    onRetry: (ExpiryMaterial) -> Unit,
    onReload: () -> Unit,
    onResumePending: () -> Unit,
    onClearPending: () -> Unit,
    onRetryPending: () -> Unit
) {
    val data = state.check
    when {
        state.checkLoading && data == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        state.checkError != null && data == null -> ErrorState(
            message = state.checkError ?: "加载失败",
            onRetry = onReload
        )

        data == null -> EmptyState("暂无数据", "请稍后重试")

        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)
        ) {
            item(key = "toolbar") {
                state.pendingScan?.let { pending ->
                    PendingScanCard(
                        pending = pending,
                        saveUi = pending.materialId.takeIf { it.isNotBlank() }?.let { state.materialStates[it] },
                        onResume = onResumePending,
                        onClear = onClearPending,
                        onRetry = onRetryPending
                    )
                }
                DateField(label = "检查日期", date = state.checkDate, onPick = onPickDate)
                Card(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
                    shape = MaterialTheme.shapes.medium,
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "扫描效期标签二维码，自动识别到期时间",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        TextButton(onClick = onScan) {
                            Icon(
                                Icons.Outlined.QrCodeScanner,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(Modifier.width(4.dp))
                            Text("扫一扫")
                        }
                    }
                }
            }

            if (data.categories.isEmpty()) {
                item {
                    EmptyState("暂无可检查的原物料", "请先在后台「效期配置」中添加分类与原物料")
                }
            }

            data.categories.forEach { category ->
                item(key = "cat-${category.id}") {
                    CategoryHeader(category)
                }
                items(category.materials, key = { it.id }) { material ->
                    MaterialRow(
                        material = material,
                        closeTime = data.closeTime,
                        saveUi = state.materialStates[material.id],
                        onEdit = { onEditMaterial(material) },
                        onRetry = { onRetry(material) }
                    )
                }
            }

            item(key = "tip") {
                Text(
                    "仅登记已填写到期时间的原物料；修改后即时保存到当天检查记录。",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun CategoryHeader(category: ExpiryCategory) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(category.name, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.width(8.dp))
        Text(
            "${category.materials.size} 项",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MaterialRow(
    material: ExpiryMaterial,
    closeTime: String,
    saveUi: MaterialSaveUi?,
    onEdit: () -> Unit,
    onRetry: () -> Unit
) {
    val colors = rememberSemanticColors()
    val record = material.record
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp).clickable(onClick = onEdit),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    material.name,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                when {
                    record?.isScrapped == true -> StatusBadge("已报废", BadgeKind.Bad)
                    record?.isProcessed == true -> StatusBadge("已处理", BadgeKind.Info)
                    record != null -> StatusBadge("已登记", BadgeKind.Ok)
                }
                Spacer(Modifier.width(8.dp))
                Text(
                    if (record != null) "修改" else "录入",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Spacer(Modifier.height(3.dp))
            val dueText = record?.dueAt?.takeIf { it.isNotBlank() }?.let(::shortDue)
            Text(
                when {
                    dueText != null -> "到期 $dueText" + if (material.closeDue) "（打烊 $closeTime）" else ""
                    material.closeDue -> "打烊到期 · $closeTime"
                    else -> "手动选择到期时间"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (saveUi != null) {
                when (saveUi.status) {
                    SaveStatus.Saving -> Text(
                        "保存中…",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    SaveStatus.Saved -> Text(
                        "✓ 已保存",
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.ok
                    )

                    SaveStatus.Failed -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "未保存：${saveUi.message}",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.bad
                        )
                        TextButton(onClick = onRetry) { Text("重试保存") }
                    }

                    SaveStatus.Idle -> Unit
                }
            }
        }
    }
}

/* ---------------- 日期选择条 ---------------- */

@Composable
private fun PendingScanCard(
    pending: PendingScan,
    saveUi: MaterialSaveUi?,
    onResume: () -> Unit,
    onClear: () -> Unit,
    onRetry: () -> Unit
) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = if (pending.saved) colors.okTint else colors.warnTint)
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "扫码结果",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleSmall
                )
                StatusBadge(
                    when {
                        pending.saved -> "已保存"
                        saveUi?.status == SaveStatus.Failed -> "保存失败"
                        pending.scrapNeeded -> "待确认报废"
                        else -> "待补全"
                    },
                    when {
                        pending.saved -> BadgeKind.Ok
                        saveUi?.status == SaveStatus.Failed -> BadgeKind.Bad
                        else -> BadgeKind.Warn
                    }
                )
            }
            Spacer(Modifier.height(3.dp))
            Text(
                buildString {
                    append(pending.name.ifBlank { "未匹配物料" })
                    append(" · ")
                    append(pending.date.ifBlank { "无日期" })
                    if (pending.time.isNotBlank()) append(" ").append(pending.time)
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (saveUi?.status == SaveStatus.Failed) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        saveUi.message,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.labelSmall,
                        color = colors.bad
                    )
                    TextButton(onClick = onRetry) { Text("重试保存") }
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onClear) { Text("清除") }
                TextButton(onClick = onResume) { Text("查看 / 继续") }
            }
        }
    }
}

@Composable
private fun DateField(label: String, date: String, onPick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp).clickable(onClick = onPick),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                label,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Icon(
                Icons.Outlined.CalendarMonth,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(6.dp))
            Text(date, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/* ---------------- TAB 2：当天到期 ---------------- */

@Composable
private fun DueTab(
    state: ExpiryUiState,
    onPickDate: () -> Unit,
    onProcess: (ExpiryRecord) -> Unit,
    onRetry: () -> Unit
) {
    when {
        state.dueLoading && state.dueList == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        state.dueError != null && state.dueList == null -> ErrorState(state.dueError, onRetry)

        else -> {
            val list = state.dueList.orEmpty()
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)
            ) {
                item(key = "date") { DateField("到期日期", state.dueDate, onPickDate) }
                if (list.isEmpty()) {
                    item { EmptyState("当天没有到期的原物料", "未填写产品效期的原物料不会展示") }
                }
                items(list, key = { it.id }) { record ->
                    DueRow(
                        record = record,
                        processing = record.id in state.processingIds,
                        onProcess = { onProcess(record) }
                    )
                }
                item(key = "tip") { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun DueRow(record: ExpiryRecord, processing: Boolean, onProcess: () -> Unit) {
    val colors = rememberSemanticColors()
    val unprocessed = record.status == "normal"
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (unprocessed) colors.warnTint else MaterialTheme.colorScheme.surface
        )
    ) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusBadge(record.categoryName.ifBlank { "未分类" }, BadgeKind.Neutral)
                Spacer(Modifier.width(8.dp))
                Text(
                    record.materialName,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                StatusBadge(
                    when {
                        record.isScrapped -> "已报废"
                        record.isProcessed -> "已处理"
                        else -> "未处理"
                    },
                    when {
                        record.isScrapped -> BadgeKind.Bad
                        record.isProcessed -> BadgeKind.Ok
                        else -> BadgeKind.Warn
                    }
                )
            }
            Spacer(Modifier.height(4.dp))
            Text(
                "到期 ${shortDue(record.dueAt)} · 登记 ${record.createdBy.ifBlank { "—" }}" +
                    if (record.note.isNotBlank()) " · ${record.note}" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (!unprocessed) {
                Text(
                    (if (record.isScrapped) "报废人 " else "处理人 ") +
                        "${record.processedBy.ifBlank { "—" }} · ${shortDue(record.processedAt)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (unprocessed) {
                Spacer(Modifier.height(4.dp))
                TextButton(
                    onClick = onProcess,
                    enabled = !processing,
                    modifier = Modifier.align(Alignment.End)
                ) { Text(if (processing) "处理中…" else "标记已处理") }
            }
        }
    }
}

/* ---------------- TAB 3：效期总览 ---------------- */

@Composable
private fun DayTab(state: ExpiryUiState, onPickDate: () -> Unit, onRetry: () -> Unit) {
    when {
        state.dayLoading && state.dayList == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        state.dayError != null && state.dayList == null -> ErrorState(state.dayError, onRetry)

        else -> {
            val list = state.dayList.orEmpty()
            val order = state.check?.categories?.map { it.name }.orEmpty()
            val groups = list
                .sortedBy { it.dueAt }
                .groupBy { it.categoryName.ifBlank { "未分类" } }
                .toList()
                .sortedBy { (name, _) ->
                    val i = order.indexOf(name)
                    if (i >= 0) i else 999
                }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)
            ) {
                item(key = "date") { DateField("登记日期", state.dayDate, onPickDate) }
                if (list.isEmpty()) {
                    item { EmptyState("当天没有登记效期", "未填写产品效期的原物料不会展示") }
                }
                groups.forEach { (categoryName, rows) ->
                    item(key = "day-cat-$categoryName") {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(categoryName, style = MaterialTheme.typography.titleMedium)
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "${rows.size} 项",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    items(rows, key = { it.id }) { record -> DayRow(record) }
                }
                item(key = "tip") { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
private fun DayRow(record: ExpiryRecord) {
    val colors = rememberSemanticColors()
    val now = LocalDateTime.now()
    val due = parseDueAt(record.dueAt)
    val highlight = when {
        record.status != "normal" -> Color.Transparent
        due == null -> Color.Transparent
        !due.isAfter(now) -> colors.badTint
        due.toLocalDate() == LocalDate.now() -> colors.warnTint
        else -> Color.Transparent
    }
    Card(
        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(
            containerColor = if (highlight == Color.Transparent) MaterialTheme.colorScheme.surface else highlight
        )
    ) {
        Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        record.materialName,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                    if (record.status != "normal") {
                        Spacer(Modifier.width(6.dp))
                        StatusBadge(
                            if (record.isScrapped) "已报废" else "已处理",
                            if (record.isScrapped) BadgeKind.Bad else BadgeKind.Ok
                        )
                    }
                }
                Text(
                    "登记 ${record.createdBy.ifBlank { "—" }} · ${record.checkDate}" +
                        if (record.note.isNotBlank()) " · ${record.note}" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (record.status != "normal") {
                    Text(
                        (if (record.isScrapped) "报废人 " else "处理人 ") +
                            "${record.processedBy.ifBlank { "—" }} · ${shortDue(record.processedAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    due?.toLocalDate()?.let { "%02d-%02d".format(it.monthValue, it.dayOfMonth) }
                        ?: record.dueAt.take(10),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    due?.let { "%02d:%02d".format(it.hour, it.minute) } ?: "",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

/* ---------------- 工具 ---------------- */

private fun parseDate(value: String): LocalDate? = runCatching {
    if (value.length < 10) null else LocalDate.parse(value.take(10))
}.getOrNull()

private fun parseTimeFromDue(value: String): Pair<Int, Int>? {
    val m = Regex("(?:[ T])(\\d{1,2}):(\\d{2})").find(value) ?: return null
    return m.groupValues[1].toIntOrNull()?.let { hour ->
        m.groupValues[2].toIntOrNull()?.let { minute -> hour to minute }
    }
}

private fun defaultTimeOf(material: ExpiryMaterial): Pair<Int, Int> {
    val raw = material.defaultTime.ifBlank { "22:00" }
    val h = raw.substringBefore(':').toIntOrNull() ?: 22
    val m = raw.substringAfter(':', "00").toIntOrNull() ?: 0
    return h to m
}

private fun shortDue(raw: String): String {
    if (raw.isBlank()) return ""
    val m = Regex("(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[ T](\\d{1,2}):(\\d{2}))?").find(raw) ?: return raw
    val g = m.groupValues
    return if (g[4].isBlank()) {
        "%02d-%02d".format(g[2].toInt(), g[3].toInt())
    } else {
        "%02d-%02d %02d:%s".format(g[2].toInt(), g[3].toInt(), g[4].toInt(), g[5])
    }
}
