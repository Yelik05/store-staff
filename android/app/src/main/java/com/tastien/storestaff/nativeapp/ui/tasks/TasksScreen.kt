package com.tastien.storestaff.nativeapp.ui.tasks

import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.tastien.storestaff.nativeapp.data.TaskContact
import com.tastien.storestaff.nativeapp.data.TaskGroup
import com.tastien.storestaff.nativeapp.data.TaskItem
import com.tastien.storestaff.nativeapp.data.TaskOverview
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.LoadMoreRow
import com.tastien.storestaff.nativeapp.ui.components.LocalImage
import com.tastien.storestaff.nativeapp.ui.components.RemoteImage
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.components.formatDeadline
import com.tastien.storestaff.nativeapp.ui.components.formatExecDate
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors

private val UNFINISHED = setOf("pending", "rejected", "overdue")

/* ---------------- 入口 ---------------- */

@Composable
fun TasksScreen(state: TasksUiState, vm: TasksViewModel) {
    val context = LocalContext.current
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    var submitTarget by remember { mutableStateOf<TaskItem?>(null) }
    var confirmTarget by remember { mutableStateOf<TaskItem?>(null) }
    var reassignTarget by remember { mutableStateOf<ReassignTarget?>(null) }
    var previewKey by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.completedSignal) {
        if (state.completedSignal > 0) {
            submitTarget = null
            confirmTarget = null
            reassignTarget = null
        }
    }

    val archive = state.archive
    if (archive != null) {
        BackHandler { vm.closeArchive() }
        ArchiveContent(
            archive = archive,
            myStaffId = state.overview?.myStaffId ?: "",
            canManage = state.overview?.canManage ?: false,
            onBack = { vm.closeArchive() },
            onRetry = { vm.archiveRetry() },
            onShiftDate = { vm.shiftArchiveDate(it) },
            onComplete = { item ->
                if (item.completionMode == "confirm") confirmTarget = item else submitTarget = item
            },
            onReassign = { item ->
                vm.loadContacts()
                reassignTarget = ReassignTarget(
                    id = item.id,
                    groupId = null,
                    currentId = item.assigneeId,
                    subject = "任务：${item.title} · ${formatExecDate(item.periodDate)} · 当前指派：" +
                        completerText(item),
                    hint = "指派后该任务的全部未完成期次归新指派人；已提交待审核或已完成的任务不受影响。"
                )
            },
            onPreview = { previewKey = it },
            onManage = { vm.manageComplete(it) }
        )
    } else {
        if (state.expanded.isNotEmpty()) {
            BackHandler { vm.collapseAll() }
        }
        Column(modifier = Modifier.fillMaxSize()) {
            TasksHeader(
                state = state,
                onOverdue = { vm.openArchive(ArchiveKind.Overdue) },
                onCompleted = { vm.openArchive(ArchiveKind.Completed) }
            )
            FilterRow(state.filter) { vm.setFilter(it) }

            when {
                state.loading && state.overview == null -> Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }

                state.overview == null -> ErrorState(
                    message = state.error ?: "加载失败",
                    onRetry = { vm.load(refresh = true) }
                )

                else -> {
                    val overview = state.overview
                    val entries = buildEntries(overview, state.filter)
                    TaskList(
                        state = state,
                        overview = overview,
                        entries = entries,
                        onRefresh = { vm.load(refresh = true) },
                        onToggle = { vm.toggleExpanded(it) },
                        onLoadMore = { vm.loadMore() },
                        onComplete = { item ->
                            if (item.completionMode == "confirm") confirmTarget = item else submitTarget = item
                        },
                        onReassign = { item ->
                            vm.loadContacts()
                            reassignTarget = ReassignTarget(
                                id = item.id,
                                groupId = null,
                                currentId = item.assigneeId,
                                subject = "任务：${item.title} · ${formatExecDate(item.periodDate)} · 当前指派：" +
                                    completerText(item),
                                hint = "指派后该任务的全部未完成期次归新指派人；已提交待审核或已完成的任务不受影响。"
                            )
                        },
                        onReassignGroup = { group ->
                            vm.loadContacts()
                            reassignTarget = ReassignTarget(
                                id = null,
                                groupId = group.parentId,
                                currentId = group.defaultAssigneeId,
                                subject = "分组：${group.title} · 期间 ${formatExecDate(group.periodDate)} · 组默认：" +
                                    group.defaultAssigneeDisplayName.ifBlank { "公共分组" },
                                hint = "只同步未单独指定的子任务；单独指定过的子任务保持不变。已提交待审核或已完成的期次不受影响。"
                            )
                        },
                        onPreview = { previewKey = it },
                        onManage = { vm.manageComplete(it) }
                    )
                }
            }
        }
    }

    submitTarget?.let { item ->
        SubmitDialog(
            item = item,
            busy = state.actionBusy,
            uploadDone = state.uploadDone,
            uploadTotal = state.uploadTotal,
            onDismiss = { if (!state.actionBusy) submitTarget = null },
            onConfirm = { uris -> vm.completeWithImages(item, uris) }
        )
    }

    confirmTarget?.let { item ->
        AlertDialog(
            onDismissRequest = { if (!state.actionBusy) confirmTarget = null },
            title = { Text("确认完成") },
            text = { Text("确认将「${item.title}」标记为完成？该任务无需返图，确认后不可撤销。") },
            confirmButton = {
                TextButton(enabled = !state.actionBusy, onClick = {
                    vm.completeConfirm(item)
                }) { Text("确认完成") }
            },
            dismissButton = {
                TextButton(enabled = !state.actionBusy, onClick = { confirmTarget = null }) { Text("取消") }
            }
        )
    }

    reassignTarget?.let { target ->
        ReassignDialog(
            target = target,
            contacts = state.contacts,
            loading = state.contactsLoading,
            busy = state.actionBusy,
            onDismiss = { if (!state.actionBusy) reassignTarget = null },
            onConfirm = { contact ->
                vm.reassign(target.id, target.groupId, contact.id, contact.displayName)
            }
        )
    }

    previewKey?.let { key ->
        ImagePreviewDialog(key) { previewKey = null }
    }
}

/* ---------------- 头部与筛选 ---------------- */

@Composable
private fun TasksHeader(state: TasksUiState, onOverdue: () -> Unit, onCompleted: () -> Unit) {
    val overdue = state.overview?.overdueCount ?: 0
    val todayPending = state.overview?.todayPending ?: 0
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("我的任务", style = MaterialTheme.typography.headlineSmall)
            Text(
                "今日待完成 $todayPending 项" + if (overdue > 0) " · 逾期 $overdue 项" else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        EntryChip(if (overdue > 0) "逾期 $overdue" else "逾期", onOverdue, highlight = overdue > 0)
        Spacer(Modifier.width(8.dp))
        EntryChip("已完成", onCompleted)
    }
}

@Composable
private fun EntryChip(text: String, onClick: () -> Unit, highlight: Boolean = false) {
    val colors = rememberSemanticColors()
    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = MaterialTheme.shapes.small,
        color = if (highlight) colors.badTint else MaterialTheme.colorScheme.surface,
        contentColor = if (highlight) colors.bad else MaterialTheme.colorScheme.onSurface
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
            style = MaterialTheme.typography.labelMedium
        )
    }
}

@Composable
private fun FilterRow(selected: TaskFilter, onSelect: (TaskFilter) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        TaskFilter.entries.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelect(filter) },
                label = { Text(filter.label, style = MaterialTheme.typography.labelMedium) }
            )
        }
    }
}

/* ---------------- 列表 ---------------- */

private sealed interface TaskEntry {
    val periodDate: String
    val title: String

    data class GroupEntry(val group: TaskGroup) : TaskEntry {
        override val periodDate: String get() = group.periodDate
        override val title: String get() = group.title
    }

    data class ItemEntry(val item: TaskItem) : TaskEntry {
        override val periodDate: String get() = item.periodDate
        override val title: String get() = item.title
    }
}

private fun buildEntries(overview: TaskOverview, filter: TaskFilter): List<TaskEntry> {
    val myId = overview.myStaffId
    val today = overview.today
    /* 与网页版一致：主列表只看当天、未完成（排除已通过/已逾期），逾期与已完成走独立入口 */
    val groups = overview.groups.filter { group ->
        val sameDay = today.isBlank() || group.periodDate == today
        sameDay && !group.done && when (filter) {
            TaskFilter.All -> true
            TaskFilter.Mine -> group.children.any { it.assigneeId.isNotBlank() && it.assigneeId == myId }
            else -> group.cycle == filter.cycle || group.children.any { it.cycle == filter.cycle }
        }
    }
    val items = overview.items.filter {
        val sameDay = today.isBlank() || it.periodDate == today
        sameDay && it.status != "approved" && it.status != "overdue" && taskMatches(it, filter, myId)
    }
    return (groups.map { TaskEntry.GroupEntry(it) } + items.map { TaskEntry.ItemEntry(it) })
        .sortedWith(compareByDescending<TaskEntry> { it.periodDate }.thenBy { it.title })
}

private fun taskMatches(item: TaskItem, filter: TaskFilter, myId: String): Boolean = when (filter) {
    TaskFilter.All -> true
    TaskFilter.Mine -> item.assigneeId.isNotBlank() && item.assigneeId == myId
    else -> item.cycle == filter.cycle
}

@Composable
private fun TaskList(
    state: TasksUiState,
    overview: TaskOverview,
    entries: List<TaskEntry>,
    onRefresh: () -> Unit,
    onToggle: (String) -> Unit,
    onLoadMore: () -> Unit,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onReassignGroup: (TaskGroup) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    val listState = rememberLazyListState()
    val visible = entries.take(state.visibleCount)
    val context = LocalContext.current
    LaunchedEffect(state.focusEntryKey, entries.size) {
        val key = state.focusEntryKey ?: return@LaunchedEffect
        val index = visible.indexOfFirst { entryKey(it) == key }
        if (index >= 0) {
            listState.animateScrollToItem(index)
        } else if (entries.isNotEmpty()) {
            Toast.makeText(context, "该任务已完成或不在当前列表", Toast.LENGTH_SHORT).show()
        }
    }
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (visible.isEmpty()) {
            item {
                EmptyState(
                    title = "今天暂无任务",
                    hint = when (state.filter) {
                        TaskFilter.Mine -> "今天没有指派给你的个人任务。"
                        TaskFilter.All -> "今天没有待完成任务；历史任务可在「逾期」「已完成」中查看。"
                        else -> "今天「${state.filter.label}」分类下暂无待完成任务，可切换其他分类查看。"
                    }
                )
            }
        }
        items(visible, key = { entryKey(it) }) { entry ->
            when (entry) {
                is TaskEntry.GroupEntry -> GroupCard(
                    group = entry.group,
                    expanded = "g:${entry.group.parentId}|${entry.group.periodDate}" in state.expanded,
                    canManage = overview.canManage,
                    myStaffId = overview.myStaffId,
                    onToggle = { onToggle("g:${entry.group.parentId}|${entry.group.periodDate}") },
                    onComplete = onComplete,
                    onReassign = onReassign,
                    onReassignGroup = onReassignGroup,
                    onPreview = onPreview,
                    onManage = onManage
                )

                is TaskEntry.ItemEntry -> SingleCard(
                    item = entry.item,
                    expanded = "t:${entry.item.id}" in state.expanded,
                    canManage = overview.canManage,
                    myStaffId = overview.myStaffId,
                    onToggle = { onToggle("t:${entry.item.id}") },
                    onComplete = onComplete,
                    onReassign = onReassign,
                    onPreview = onPreview,
                    onManage = onManage
                )
            }
        }
        if (entries.size > visible.size) {
            item { LoadMoreRow(entries.size - visible.size, onLoadMore) }
        }
        item {
            TextButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("刷新") }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

private fun entryKey(entry: TaskEntry): String = when (entry) {
    is TaskEntry.GroupEntry -> "g:${entry.group.parentId}|${entry.group.periodDate}"
    is TaskEntry.ItemEntry -> "t:${entry.item.id}"
}

/* ---------------- 卡片 ---------------- */

@Composable
private fun SingleCard(
    item: TaskItem,
    expanded: Boolean,
    canManage: Boolean,
    myStaffId: String,
    onToggle: () -> Unit,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(14.dp)
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        item.title,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusBadge(statusText(item), statusKind(item.status))
                }
                Spacer(Modifier.height(6.dp))
                MetaLine("截止", formatDeadline(item.deadlineText))
                MetaLine("完成人", completerText(item))
            }
            if (expanded) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                SingleDetail(item, myStaffId, canManage, onComplete, onReassign, onPreview, onManage)
            }
        }
    }
}

@Composable
private fun GroupCard(
    group: TaskGroup,
    expanded: Boolean,
    canManage: Boolean,
    myStaffId: String,
    onToggle: () -> Unit,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onReassignGroup: (TaskGroup) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggle)
                    .padding(14.dp)
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        group.title,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(Modifier.width(8.dp))
                    if (group.done) {
                        StatusBadge("已完成", BadgeKind.Ok)
                    } else {
                        StatusBadge("进度 ${group.progressText.ifBlank { "0/${group.total}" }}", BadgeKind.Warn)
                    }
                }
                Spacer(Modifier.height(6.dp))
                MetaLine("截止", groupDeadline(group))
                MetaLine("完成人", group.defaultAssigneeDisplayName.ifBlank { "公共任务" })
                if (group.children.isNotEmpty()) {
                    Spacer(Modifier.height(4.dp))
                    group.children.take(3).forEach { child ->
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 1.dp)) {
                            Box(
                                modifier = Modifier
                                    .size(4.dp)
                                    .background(MaterialTheme.colorScheme.outline, CircleShape)
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(
                                "${child.title} · ${statusText(child)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                    if (group.children.size > 3) {
                        Text(
                            "等 ${group.children.size} 项子任务",
                            style = MaterialTheme.typography.labelSmall,
                            color = colors.neutral
                        )
                    }
                }
            }
            if (expanded) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                Column(modifier = Modifier.padding(14.dp)) {
                    if (group.content.isNotBlank()) {
                        Text(group.content, style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.height(8.dp))
                    }
                    val busy = group.children.any { it.status in UNFINISHED }
                    if (canManage && busy) {
                        OutlinedButton(onClick = { onReassignGroup(group) }) { Text("改派整组") }
                        Spacer(Modifier.height(8.dp))
                    }
                    if (group.children.isEmpty()) {
                        Text(
                            "该分组暂无可执行子任务。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        group.children.forEachIndexed { index, child ->
                            if (index > 0) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 10.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant,
                                    thickness = 0.5.dp
                                )
                            }
                            ChildRow(
                                child = child,
                                myStaffId = myStaffId,
                                canManage = canManage,
                                onComplete = onComplete,
                                onReassign = onReassign,
                                onPreview = onPreview,
                                onManage = onManage
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChildRow(
    child: TaskItem,
    myStaffId: String,
    canManage: Boolean,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    Column {
        Row(verticalAlignment = Alignment.Top) {
            Text(
                child.title,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.width(8.dp))
            StatusBadge(statusText(child), statusKind(child.status))
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "截止 ${formatDeadline(child.deadlineText)} · 完成人 ${completerText(child)}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (child.content.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            Text(child.content, style = MaterialTheme.typography.bodySmall)
        }
        if (child.sampleImages.isNotEmpty()) {
            SampleRow(child.sampleImages, onPreview)
        }
        ActionRow(child, myStaffId, canManage, compact = true, onComplete = onComplete, onReassign = onReassign, onManage = onManage)
    }
}

@Composable
private fun SingleDetail(
    item: TaskItem,
    myStaffId: String,
    canManage: Boolean,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    val colors = rememberSemanticColors()
    Column(modifier = Modifier.padding(14.dp)) {
        if (item.content.isNotBlank()) {
            Text(item.content, style = MaterialTheme.typography.bodyMedium)
        }
        if (item.sampleImages.isNotEmpty()) {
            SampleRow(item.sampleImages, onPreview)
        }
        val tags = buildList {
            if (item.kindId.isNotBlank() && item.kindId != "sys" && item.kindName.isNotBlank()) add(item.kindName)
            if (item.completionMode == "confirm") add("仅需确认")
            if (item.completionScope == "all") add("全员 ${item.progressText.ifBlank { "0/0" }} 已完成")
            if (item.periodDate.isNotBlank()) add("执行日 ${formatExecDate(item.periodDate)}")
            if (item.groupTitle.isNotBlank()) add("分组：${item.groupTitle}")
        }
        if (tags.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                tags.forEach { tag ->
                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        Text(
                            tag,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        if (item.status == "rejected") {
            Spacer(Modifier.height(8.dp))
            Text(
                "驳回原因：${item.rejectReason.ifBlank { "未填写" }}",
                style = MaterialTheme.typography.bodySmall,
                color = colors.bad
            )
        }
        if (item.completionScope == "all" && item.missingNames.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            val names = item.missingNames.take(4).joinToString("、") +
                if (item.missingNames.size > 4) " 等 ${item.missingNames.size} 人" else ""
            Text(
                "未完成：$names",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (item.images.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(
                "已提交返图",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(4.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                item.images.forEach { key ->
                    RemoteImage(key, Modifier.size(52.dp), onClick = { onPreview(key) })
                }
            }
        }
        ActionRow(item, myStaffId, canManage, compact = false, onComplete = onComplete, onReassign = onReassign, onManage = onManage)
    }
}

@Composable
private fun ActionRow(
    item: TaskItem,
    myStaffId: String,
    canManage: Boolean,
    compact: Boolean,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    val colors = rememberSemanticColors()
    val unfinished = item.status in UNFINISHED
    val isMine = item.assigneeId.isBlank() || item.assigneeId == myStaffId
    val canManageComplete = canManage && unfinished && !isMine && item.assigneeId.isNotBlank()
    var confirmingManage by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().padding(top = if (compact) 6.dp else 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (canManage && unfinished) {
            OutlinedButton(onClick = { onReassign(item) }) {
                Text(if (item.assigneeId.isBlank()) "指派" else "改派")
            }
        }
        if (canManageComplete) {
            OutlinedButton(onClick = { confirmingManage = true }) { Text("代完成") }
        }
        when {
            unfinished && isMine -> Button(onClick = { onComplete(item) }) {
                Text(
                    when {
                        item.completionMode == "confirm" -> "标记完成"
                        item.status == "overdue" -> "补交返图"
                        item.status == "rejected" -> "重新提交"
                        else -> "上传返图"
                    }
                )
            }

            unfinished && !canManageComplete -> Text(
                "已指派给 ${item.assigneeDisplayName.ifBlank { "其他同事" }}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            item.status == "submitted" -> Text(
                "已由 ${item.submitterName.ifBlank { "同事" }} 提交，待审核",
                style = MaterialTheme.typography.bodySmall,
                color = colors.info
            )

            !unfinished -> Text(
                "已完成",
                style = MaterialTheme.typography.bodySmall,
                color = colors.ok
            )
        }
    }

    if (confirmingManage) {
        AlertDialog(
            onDismissRequest = { confirmingManage = false },
            title = { Text("代完成任务") },
            text = {
                Text(
                    "确认将「${item.title}」标记为完成？" +
                        "代完成不进入审核，会记录操作人与原执行人${item.assigneeDisplayName.let { if (it.isBlank()) "" else "（$it）" }}。"
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingManage = false
                    onManage(item)
                }) { Text("确认代完成") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingManage = false }) { Text("取消") }
            }
        )
    }
}

/* ---------------- 逾期 / 已完成 ---------------- */

@Composable
private fun ArchiveContent(
    archive: ArchiveUiState,
    myStaffId: String,
    canManage: Boolean,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onShiftDate: (Int) -> Unit,
    onComplete: (TaskItem) -> Unit,
    onReassign: (TaskItem) -> Unit,
    onPreview: (String) -> Unit,
    onManage: (TaskItem) -> Unit
) {
    val title = if (archive.kind == ArchiveKind.Overdue) "逾期任务" else "已完成任务"
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
            }
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.weight(1f))
            Text(
                if (archive.kind == ArchiveKind.Overdue) "共 ${archive.items.size} 项" else "共 ${archive.items.size} 项",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.width(12.dp))
        }
        if (archive.kind == ArchiveKind.Completed) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = { onShiftDate(-1) }) { Text("前一天") }
                Text(
                    formatExecDate(archive.date) + if (archive.date == archive.today) "（今天）" else "",
                    modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.bodyMedium
                )
                TextButton(
                    enabled = archive.date < archive.today,
                    onClick = { onShiftDate(1) }
                ) { Text("后一天") }
            }
        }
        when {
            archive.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }

            archive.error != null -> ErrorState(archive.error, onRetry)

            archive.items.isEmpty() -> EmptyState(
                title = if (archive.kind == ArchiveKind.Overdue) "没有逾期任务" else "当天没有已完成任务",
                hint = if (archive.kind == ArchiveKind.Overdue) "已过截止时间且未完成的任务会出现在这里。" else "可切换日期查看其他日期的完成记录。"
            )

            else -> {
                val listState = rememberLazyListState()
                var expandedId by remember { mutableStateOf<Long?>(null) }
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(archive.items, key = { "a:${it.id}" }) { item ->
                        SingleCard(
                            item = item,
                            expanded = expandedId == item.id,
                            canManage = canManage,
                            myStaffId = myStaffId,
                            onToggle = { expandedId = if (expandedId == item.id) null else item.id },
                            onComplete = onComplete,
                            onReassign = onReassign,
                            onPreview = onPreview,
                            onManage = onManage
                        )
                    }
                    item { Spacer(Modifier.height(12.dp)) }
                }
            }
        }
    }
}

/* ---------------- 弹窗 ---------------- */

private data class ReassignTarget(
    val id: Long?,
    val groupId: String?,
    val currentId: String,
    val subject: String,
    val hint: String
)

@Composable
private fun ReassignDialog(
    target: ReassignTarget,
    contacts: List<TaskContact>?,
    loading: Boolean,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: (TaskContact) -> Unit
) {
    var selectedId by remember { mutableStateOf("") }
    val candidates = remember(contacts, target.currentId) {
        contacts?.filter { it.id != target.currentId } ?: emptyList()
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (target.groupId != null) "改派整组" else "指派任务") },
        text = {
            Column(modifier = Modifier.heightIn(max = 420.dp)) {
                Text(
                    target.subject,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                when {
                    loading -> Box(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp),
                        contentAlignment = Alignment.Center
                    ) { CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp) }

                    candidates.isEmpty() -> Text(
                        "没有可指派的其他在职员工",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    else -> LazyColumn(modifier = Modifier.heightIn(max = 280.dp)) {
                        items(candidates, key = { it.id }) { contact ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { selectedId = contact.id }
                                    .padding(vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = selectedId == contact.id,
                                    onClick = { selectedId = contact.id }
                                )
                                Column {
                                    Text(contact.displayName, style = MaterialTheme.typography.bodyMedium)
                                    if (contact.position.isNotBlank()) {
                                        Text(
                                            contact.position,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    target.hint,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && selectedId.isNotBlank(),
                onClick = { candidates.firstOrNull { it.id == selectedId }?.let(onConfirm) }
            ) { Text(if (busy) "提交中…" else "确认") }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
private fun SubmitDialog(
    item: TaskItem,
    busy: Boolean,
    uploadDone: Int,
    uploadTotal: Int,
    onDismiss: () -> Unit,
    onConfirm: (List<Uri>) -> Unit
) {
    val selected = remember { mutableStateListOf<Uri>() }
    var confirming by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(9)
    ) { uris ->
        uris.forEach { uri ->
            if (selected.size < 9 && !selected.contains(uri)) selected.add(uri)
        }
    }
    val colors = rememberSemanticColors()

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = {
            Text(
                when (item.status) {
                    "overdue" -> "补交返图"
                    "rejected" -> "重新提交"
                    else -> "上传返图"
                }
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 430.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(item.title, style = MaterialTheme.typography.titleMedium)
                if (item.content.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        item.content,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                if (item.sampleImages.isNotEmpty()) {
                    SampleRow(item.sampleImages) {}
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "最多 9 张，支持 JPG / PNG / WEBP / GIF，单张不超过 20MB。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    enabled = !busy && selected.size < 9,
                    onClick = {
                        picker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    }
                ) { Text(if (selected.isEmpty()) "选择图片" else "继续添加（${selected.size}/9）") }

                if (selected.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        selected.forEach { uri ->
                            Box(modifier = Modifier.size(64.dp)) {
                                LocalImage(uri, Modifier.fillMaxSize())
                                Box(
                                    modifier = Modifier
                                        .align(Alignment.TopEnd)
                                        .size(18.dp)
                                        .background(Color.Black.copy(alpha = 0.55f), CircleShape)
                                        .clickable(enabled = !busy) { selected.remove(uri) },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text("×", color = Color.White, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                }
                if (busy) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        if (uploadTotal > 0) "正在上传 $uploadDone/$uploadTotal…" else "提交中…",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.info
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && selected.isNotEmpty(),
                onClick = { confirming = true }
            ) { Text("提交") }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = onDismiss) { Text("取消") }
        }
    )

    if (confirming) {
        AlertDialog(
            onDismissRequest = { if (!busy) confirming = false },
            title = { Text("确认提交") },
            text = { Text("确认提交 ${selected.size} 张返图？提交后将进入待审核，截止前不可重复提交。") },
            confirmButton = {
                TextButton(
                    enabled = !busy,
                    onClick = {
                        confirming = false
                        onConfirm(selected.toList())
                    }
                ) { Text("确认提交") }
            },
            dismissButton = {
                TextButton(enabled = !busy, onClick = { confirming = false }) { Text("再检查一下") }
            }
        )
    }
}

@Composable
private fun ImagePreviewDialog(key: String, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(380.dp)
                .background(Color.Black.copy(alpha = 0.92f), RoundedCornerShape(14.dp))
                .clickable(onClick = onDismiss)
                .padding(8.dp)
        ) {
            RemoteImage(
                key = key,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit
            )
        }
    }
}

/* ---------------- 小部件 ---------------- */

@Composable
private fun MetaLine(label: String, value: String) {
    Row(modifier = Modifier.padding(vertical = 1.dp)) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(46.dp)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun SampleRow(images: List<String>, onPreview: (String) -> Unit) {
    Column(modifier = Modifier.padding(top = 8.dp)) {
        Text(
            "拍摄示例",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(4.dp))
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            images.forEach { key ->
                RemoteImage(key, Modifier.size(52.dp), onClick = { onPreview(key) })
            }
        }
    }
}

/* ---------------- 口径 ---------------- */

private fun statusText(item: TaskItem): String =
    if (item.status == "rejected") "已驳回 · 未重提" else item.statusLabel.ifBlank { item.status }

private fun statusKind(status: String): BadgeKind = when (status) {
    "approved" -> BadgeKind.Ok
    "submitted" -> BadgeKind.Info
    "rejected", "overdue" -> BadgeKind.Bad
    else -> BadgeKind.Warn
}

private fun completerText(item: TaskItem): String {
    if (item.assigneeId.isBlank()) return "公共任务"
    val who = item.assigneeDisplayName.ifBlank { "同事" }
    return when (item.assigneeSource) {
        "self" -> "$who（单独指派）"
        "inherit" -> "$who（继承）"
        else -> who
    }
}

private fun groupDeadline(group: TaskGroup): String {
    val raw = group.children
        .mapNotNull { it.deadlineText.takeIf(String::isNotBlank) }
        .minOrNull()
    return if (raw.isNullOrBlank()) "—" else formatDeadline(raw)
}
