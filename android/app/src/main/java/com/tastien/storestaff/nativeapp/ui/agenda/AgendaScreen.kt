package com.tastien.storestaff.nativeapp.ui.agenda

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.Context
import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.tastien.storestaff.nativeapp.data.AgendaItem
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import java.time.LocalDate

private val REMIND_OPTIONS = listOf(
    -1 to "不提醒",
    0 to "准时",
    5 to "提前5分钟",
    15 to "提前15分钟",
    30 to "提前30分钟",
    60 to "提前1小时"
)

@Composable
fun AgendaScreen(state: AgendaUiState, vm: AgendaViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    var deleteTarget by remember { mutableStateOf<AgendaItem?>(null) }

    BackHandler(onBack = onBack)
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        AgendaHeader(state, onBack = onBack, onCreate = { vm.startCreate() })
        if (state.canViewAll) {
            ScopeTabs(state.scope) { vm.setScope(it) }
        }
        Spacer(Modifier.height(6.dp))

        Box(modifier = Modifier.weight(1f)) {
            when {
                state.loading && state.items.isEmpty() -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                state.error != null && state.items.isEmpty() -> ErrorState(state.error, { vm.retry() })

                state.items.isEmpty() -> EmptyState(
                    title = if (state.scope == "all") "暂无门店日程" else "还没有日程",
                    hint = if (state.scope == "all") {
                        "门店创建的公共日程会显示在这里。"
                    } else {
                        "点击右上角「新建」添加个人日程。"
                    }
                )

                else -> AgendaList(
                    state = state,
                    onEdit = { vm.startEdit(it) },
                    onDelete = { deleteTarget = it }
                )
            }
        }
    }

    if (state.showEditor) {
        AgendaEditorDialog(state, vm, onDismiss = { vm.closeEditor() })
    }

    deleteTarget?.let { item ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("删除日程") },
            text = { Text("确认删除「${item.title.ifBlank { "该日程" }}」？删除后不可恢复。") },
            confirmButton = {
                TextButton(onClick = {
                    deleteTarget = null
                    vm.remove(item)
                }) { Text("删除") }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("取消") }
            }
        )
    }
}

/* ---------------- 头部与范围切换 ---------------- */

@Composable
private fun AgendaHeader(state: AgendaUiState, onBack: () -> Unit, onCreate: () -> Unit) {
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
            Text("日程", style = MaterialTheme.typography.headlineSmall)
            Text(
                if (state.scope == "all") "门店全部日程" else "我的日程",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Button(onClick = onCreate) {
            Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(4.dp))
            Text("新建")
        }
    }
}

@Composable
private fun ScopeTabs(scope: String, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        listOf("mine" to "我的", "all" to "全部").forEach { (value, label) ->
            FilterChip(
                selected = scope == value,
                onClick = { onSelect(value) },
                label = { Text(label, style = MaterialTheme.typography.labelMedium) }
            )
        }
    }
}

/* ---------------- 分组列表 ---------------- */

@Composable
private fun AgendaList(state: AgendaUiState, onEdit: (AgendaItem) -> Unit, onDelete: (AgendaItem) -> Unit) {
    val today = LocalDate.now().toString()
    val todayItems = state.items.filter { it.date == today }.sortedBy { it.startTime }
    val futureItems = state.items
        .filter { it.date > today }
        .sortedWith(compareBy({ it.date }, { it.startTime }))
    val pastItems = state.items
        .filter { it.date < today }
        .sortedWith(compareByDescending<AgendaItem> { it.date }.thenByDescending { it.startTime })

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (todayItems.isNotEmpty()) {
            item { GroupHeader("今天") }
            items(todayItems, key = { "today_${it.id}" }) { item ->
                AgendaCard(
                    item = item,
                    deleting = state.deletingId == item.id,
                    onEdit = onEdit,
                    onDelete = onDelete
                )
            }
        }
        if (futureItems.isNotEmpty()) {
            item { GroupHeader("未来") }
            items(futureItems, key = { "future_${it.id}" }) { item ->
                AgendaCard(
                    item = item,
                    deleting = state.deletingId == item.id,
                    onEdit = onEdit,
                    onDelete = onDelete
                )
            }
        }
        if (pastItems.isNotEmpty()) {
            item { GroupHeader("过去") }
            items(pastItems, key = { "past_${it.id}" }) { item ->
                AgendaCard(
                    item = item,
                    deleting = state.deletingId == item.id,
                    onEdit = onEdit,
                    onDelete = onDelete
                )
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun GroupHeader(text: String) {
    Text(
        text,
        modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 2.dp),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurface
    )
}

@Composable
private fun AgendaCard(
    item: AgendaItem,
    deleting: Boolean,
    onEdit: (AgendaItem) -> Unit,
    onDelete: (AgendaItem) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row {
                Column(modifier = Modifier.width(66.dp)) {
                    Text(
                        formatAgendaDate(item.date),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        item.startTime.ifBlank { "--:--" },
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                    if (item.endTime.isNotBlank()) {
                        Text(
                            "至 ${item.endTime}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        item.title.ifBlank { "未命名日程" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (item.location.isNotBlank()) {
                        Text(
                            "地点：${item.location}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    Text(
                        creatorLine(item),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (item.remark.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    item.remark,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (item.participants.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    "参与人：${item.participants.joinToString("、") { it.name }}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            if (item.isOwner) {
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(enabled = !deleting, onClick = { onEdit(item) }) { Text("编辑") }
                    TextButton(enabled = !deleting, onClick = { onDelete(item) }) {
                        Text(if (deleting) "删除中…" else "删除")
                    }
                }
            }
        }
    }
}

/* ---------------- 新建 / 编辑 ---------------- */

@Composable
private fun AgendaEditorDialog(state: AgendaUiState, vm: AgendaViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val editing = state.editing

    var title by remember(editing?.id) { mutableStateOf(editing?.title.orEmpty()) }
    var date by remember(editing?.id) {
        mutableStateOf(editing?.date?.takeIf { it.isNotBlank() } ?: LocalDate.now().toString())
    }
    var startTime by remember(editing?.id) {
        mutableStateOf(editing?.startTime?.takeIf { it.isNotBlank() } ?: "09:00")
    }
    var endTime by remember(editing?.id) { mutableStateOf(editing?.endTime.orEmpty()) }
    var location by remember(editing?.id) { mutableStateOf(editing?.location.orEmpty()) }
    var remark by remember(editing?.id) { mutableStateOf(editing?.remark.orEmpty()) }
    var remindMinutes by remember(editing?.id) { mutableStateOf(editing?.remindMinutes ?: 0) }

    Dialog(onDismissRequest = { if (!state.saving) onDismiss() }) {
        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(modifier = Modifier.heightIn(max = 620.dp).padding(18.dp)) {
                Text(
                    if (editing == null) "新建日程" else "编辑日程",
                    style = MaterialTheme.typography.titleLarge
                )
                Spacer(Modifier.height(10.dp))

                Column(
                    modifier = Modifier
                        .weight(1f, fill = false)
                        .verticalScroll(rememberScrollState())
                ) {
                    FieldLabel("标题")
                    OutlinedTextField(
                        value = title,
                        onValueChange = { if (it.length <= 60) title = it },
                        enabled = !state.saving,
                        singleLine = true,
                        placeholder = { Text("如：周会 / 团建 / 盘点") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(10.dp))
                    FieldLabel("日期")
                    OutlinedButton(
                        enabled = !state.saving,
                        onClick = {
                            openDatePicker(context, date) { date = it }
                        }
                    ) { Text(date.ifBlank { "选择日期" }) }

                    Spacer(Modifier.height(10.dp))
                    FieldLabel("时间")
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            enabled = !state.saving,
                            onClick = {
                                openTimePicker(context, startTime) { startTime = it }
                            }
                        ) { Text("开始 $startTime") }
                        OutlinedButton(
                            enabled = !state.saving,
                            onClick = {
                                openTimePicker(context, endTime.ifBlank { startTime }) { endTime = it }
                            }
                        ) { Text(if (endTime.isBlank()) "结束（选填）" else "结束 $endTime") }
                        if (endTime.isNotBlank()) {
                            TextButton(enabled = !state.saving, onClick = { endTime = "" }) {
                                Text("清除")
                            }
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    FieldLabel("地点")
                    OutlinedTextField(
                        value = location,
                        onValueChange = { if (it.length <= 60) location = it },
                        enabled = !state.saving,
                        singleLine = true,
                        placeholder = { Text("选填") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(10.dp))
                    FieldLabel("备注")
                    OutlinedTextField(
                        value = remark,
                        onValueChange = { if (it.length <= 200) remark = it },
                        enabled = !state.saving,
                        maxLines = 3,
                        placeholder = { Text("选填") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    Spacer(Modifier.height(10.dp))
                    FieldLabel("提醒")
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        REMIND_OPTIONS.forEach { (value, label) ->
                            FilterChip(
                                selected = remindMinutes == value,
                                enabled = !state.saving,
                                onClick = { remindMinutes = value },
                                label = { Text(label) }
                            )
                        }
                    }

                    if (editing != null && editing.participants.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        FieldLabel("参与人")
                        Text(
                            editing.participants.joinToString("、") { it.name },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
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
                    TextButton(enabled = !state.saving, onClick = onDismiss) { Text("取消") }
                    Spacer(Modifier.width(8.dp))
                    Button(
                        enabled = !state.saving,
                        onClick = {
                            vm.save(
                                title = title,
                                date = date,
                                startTime = startTime,
                                endTime = endTime,
                                location = location,
                                remark = remark,
                                remindMinutes = remindMinutes
                            )
                        }
                    ) { Text(if (state.saving) "保存中…" else "保存") }
                }
            }
        }
    }
}

/* ---------------- 小部件与工具 ---------------- */

@Composable
private fun FieldLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    Spacer(Modifier.height(4.dp))
}

private fun creatorLine(item: AgendaItem): String {
    val creator = "创建人 ${item.creatorName.ifBlank { "—" }}"
    return if (item.isInvited) "$creator · 邀请我参与" else creator
}

private fun formatAgendaDate(date: String): String = when {
    date.isBlank() -> ""
    date == LocalDate.now().toString() -> "今天"
    date.length >= 10 -> date.substring(5).replace('-', '/')
    else -> date
}

private fun openDatePicker(context: Context, initial: String, onPick: (String) -> Unit) {
    val base = runCatching { LocalDate.parse(initial) }.getOrDefault(LocalDate.now())
    DatePickerDialog(
        context,
        { _, year, month, day -> onPick(LocalDate.of(year, month + 1, day).toString()) },
        base.year,
        base.monthValue - 1,
        base.dayOfMonth
    ).show()
}

private fun openTimePicker(context: Context, initial: String, onPick: (String) -> Unit) {
    val parts = initial.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: 9
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
    TimePickerDialog(context, { _, h, m -> onPick("%02d:%02d".format(h, m)) }, hour, minute, true).show()
}
