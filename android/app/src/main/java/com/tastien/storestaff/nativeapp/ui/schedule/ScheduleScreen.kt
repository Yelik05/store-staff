package com.tastien.storestaff.nativeapp.ui.schedule

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.widget.Toast
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tastien.storestaff.nativeapp.data.LeaveItem
import com.tastien.storestaff.nativeapp.data.LeaveSummary
import com.tastien.storestaff.nativeapp.data.ShiftRequestItem
import com.tastien.storestaff.nativeapp.data.ShiftSlot
import com.tastien.storestaff.nativeapp.data.ShiftSummary
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.Dot
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.ShiftTodayCard
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.components.formatExecDate
import com.tastien.storestaff.nativeapp.ui.components.formatTime
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.temporal.ChronoUnit

@Composable
fun ScheduleScreen(state: ScheduleUiState, vm: ScheduleViewModel) {
    val context = LocalContext.current
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    var showLeaveApply by remember { mutableStateOf(false) }
    var showShiftApply by remember { mutableStateOf(false) }
    var shiftEditFrom by remember { mutableStateOf<ShiftRequestItem?>(null) }
    var cancelTarget by remember { mutableStateOf<CancelTarget?>(null) }

    LaunchedEffect(state.actionSignal) {
        if (state.actionSignal > 0) {
            showLeaveApply = false
            showShiftApply = false
            shiftEditFrom = null
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (state.isPartTime) "排班申请" else "排休申请",
                    style = MaterialTheme.typography.headlineSmall
                )
                Text(
                    monthLabel() + " · 仅显示当月申请",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Button(
                enabled = !state.loading,
                onClick = {
                    if (state.isPartTime) {
                        shiftEditFrom = null
                        showShiftApply = true
                    } else {
                        showLeaveApply = true
                    }
                }
            ) { Text(if (state.isPartTime) "申请排班" else "申请排休") }
        }

        when {
            state.loading && state.leave == null && state.shift == null -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            state.error != null && state.leave == null && state.shift == null -> Column {
                ErrorState(state.error, { vm.retry() })
            }

            else -> Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp)
            ) {
                ShiftTodayCard(
                    shift = state.todayShift,
                    dateText = state.todayShift?.date.orEmpty(),
                    onClick = null
                )
                if (state.todayError != null) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "今日排班加载失败：${state.todayError}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }

                Spacer(Modifier.height(12.dp))
                if (state.isPartTime) {
                    ShiftSummaryCard(state.shift)
                } else {
                    LeaveSummaryCard(state.leave)
                }

                Spacer(Modifier.height(16.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("我的申请记录", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { vm.load(refresh = true) }) {
                        Text(if (state.refreshing) "刷新中…" else "刷新")
                    }
                }
                Spacer(Modifier.height(4.dp))

                val leaveList = state.leave?.list?.filter { it.status != "cancelled" }.orEmpty()
                    .sortedByDescending { it.date }
                val shiftList = state.shift?.list?.filter { it.status != "cancelled" }.orEmpty()
                    .sortedByDescending { it.createdAt }

                if (state.isPartTime) {
                    if (shiftList.isEmpty()) {
                        EmptyState(
                            title = "本月还没有排班申请",
                            hint = "填写可上班的日期与时段，提交后等待店长审批。"
                        )
                    } else {
                        shiftList.forEach { item ->
                            ShiftRequestCard(
                                item = item,
                                onWithdraw = { cancelTarget = CancelTarget(item.id, true, true) },
                                onCancel = { cancelTarget = CancelTarget(item.id, false, true) },
                                onEdit = {
                                    shiftEditFrom = item
                                    showShiftApply = true
                                }
                            )
                            Spacer(Modifier.height(10.dp))
                        }
                    }
                } else {
                    if (leaveList.isEmpty()) {
                        EmptyState(
                            title = "本月还没有排休记录",
                            hint = "需要休息时点上方按钮申请。"
                        )
                    } else {
                        leaveList.forEach { item ->
                            LeaveRequestCard(
                                item = item,
                                onWithdraw = { cancelTarget = CancelTarget(item.id, true, false) },
                                onCancel = { cancelTarget = CancelTarget(item.id, false, false) },
                                onReapply = { showLeaveApply = true }
                            )
                            Spacer(Modifier.height(10.dp))
                        }
                    }
                }

                Text(
                    if (state.isPartTime) {
                        "页面仅显示你本人的排班记录，不展示其他兼职的排班情况。"
                    } else {
                        "页面仅显示你本人的排休记录，不展示其他员工的排休情况。"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 10.dp)
                )
                Spacer(Modifier.height(16.dp))
            }
        }
    }

    if (showLeaveApply) {
        LeaveApplyDialog(state, vm) { showLeaveApply = false }
    }
    if (showShiftApply) {
        ShiftApplyDialog(
            initial = shiftEditFrom,
            busy = state.actionBusy,
            onDismiss = { if (!state.actionBusy) showShiftApply = false },
            onSubmit = { slots, note -> vm.applyShift(slots, note) }
        )
    }
    cancelTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { if (!state.actionBusy) cancelTarget = null },
            title = { Text(if (target.withdraw) "撤回申请" else "申请取消") },
            text = {
                Text(
                    if (target.withdraw) {
                        "确认撤回本次申请？撤回后不计入已休天数。"
                    } else {
                        "取消已通过的申请需店长同意，确认提交取消申请？"
                    }
                )
            },
            confirmButton = {
                TextButton(enabled = !state.actionBusy, onClick = {
                    val t = target
                    cancelTarget = null
                    if (t.isShift) vm.cancelShift(t.id, t.withdraw) else vm.cancelLeave(t.id, t.withdraw)
                }) { Text(if (target.withdraw) "撤回" else "提交申请") }
            },
            dismissButton = {
                TextButton(enabled = !state.actionBusy, onClick = { cancelTarget = null }) { Text("取消") }
            }
        )
    }
}

private data class CancelTarget(val id: String, val withdraw: Boolean, val isShift: Boolean)

/* ---------------- 汇总卡 ---------------- */

@Composable
private fun LeaveSummaryCard(leave: LeaveSummary?) {
    val d = leave ?: LeaveSummary()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    formatNumber(d.remaining),
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    "天 · 本月剩余可休",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 3.dp)
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "应休 ${formatNumber(d.quota)} 天 / 已休 ${d.used} 天 / 审批中 ${d.pending} 天",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                "事假 ${d.byType["事假"] ?: 0} 天 · 病假 ${d.byType["病假"] ?: 0} 天（均计入已休）",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            HorizontalDivider(
                modifier = Modifier.padding(vertical = 10.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
                thickness = 0.5.dp
            )
            Text(
                "同一岗位每日仅 1 人可休息；事假、病假均占用本月月休额度，扣薪以薪资明细中的扣款项为准。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ShiftSummaryCard(shift: ShiftSummary?) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatusBlock("已通过时段", shift?.approvedSlots ?: 0, colors.ok)
                StatusBlock("审批中时段", shift?.pendingSlots ?: 0, colors.warn)
            }
            HorizontalDivider(
                modifier = Modifier.padding(vertical = 10.dp),
                color = MaterialTheme.colorScheme.outlineVariant,
                thickness = 0.5.dp
            )
            Text(
                "按你填写的可上班日期与时段提交，店长审批后安排班次；单个时段不得与其他待审批/已通过时段重叠。",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun StatusBlock(label: String, value: Int, color: androidx.compose.ui.graphics.Color) {
    Column {
        Text("$value", style = MaterialTheme.typography.headlineSmall, color = color)
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

/* ---------------- 申请记录 ---------------- */

@Composable
private fun LeaveRequestCard(
    item: LeaveItem,
    onWithdraw: () -> Unit,
    onCancel: () -> Unit,
    onReapply: () -> Unit
) {
    val (text, kind) = leaveStatus(item)
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "${item.date} · ${item.type}" + if (item.manual) "（管理组代录）" else "",
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Text(
                        "提交 ${formatTime(item.createdAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                StatusBadge(text, kind)
            }
            Spacer(Modifier.height(8.dp))
            ApprovalProgress(
                status = item.status,
                createdAt = item.createdAt,
                reviewedBy = item.reviewedBy,
                reviewedAt = item.reviewedAt,
                cancelRequested = item.cancelRequested,
                forceReason = item.forceReason
            )
            if (item.reason.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "说明：${item.reason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (item.rejectReason.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "驳回原因：${item.rejectReason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.bad
                )
            }
            Row(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (item.status == "pending") {
                    OutlinedButton(onClick = onWithdraw) { Text("撤回申请") }
                }
                if (item.status == "approved" && !item.cancelRequested) {
                    OutlinedButton(onClick = onCancel) { Text("申请取消") }
                }
                if (item.status == "rejected") {
                    Button(onClick = onReapply) { Text("重新申请") }
                }
            }
        }
    }
}

@Composable
private fun ShiftRequestCard(
    item: ShiftRequestItem,
    onWithdraw: () -> Unit,
    onCancel: () -> Unit,
    onEdit: () -> Unit
) {
    val (text, kind) = shiftStatus(item)
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("排班 · ${item.slots.size} 个时段", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "提交 ${formatTime(item.createdAt)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                StatusBadge(text, kind)
            }
            if (item.slots.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                item.slots.sortedWith(compareBy({ it.date }, { it.start })).forEach { slot ->
                    Text(
                        "${formatExecDate(slot.date)}  ${slot.start}—${slot.end}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            ApprovalProgress(
                status = item.status,
                createdAt = item.createdAt,
                reviewedBy = item.reviewedBy,
                reviewedAt = item.reviewedAt,
                cancelRequested = item.cancelRequested,
                forceReason = ""
            )
            if (item.status == "pending") {
                val waited = hoursSince(item.createdAt)
                if (waited > 24) {
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "已等待审批 $waited 小时，可提醒店长处理",
                        style = MaterialTheme.typography.bodySmall,
                        color = colors.warn
                    )
                }
            }
            if (item.note.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "说明：${item.note}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (item.rejectReason.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "驳回原因：${item.rejectReason}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.bad
                )
            }
            Row(
                modifier = Modifier.padding(top = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (item.status == "pending") {
                    OutlinedButton(onClick = onWithdraw) { Text("撤回申请") }
                }
                if (item.status == "approved" && !item.cancelRequested) {
                    OutlinedButton(onClick = onCancel) { Text("申请取消") }
                }
                if (item.status == "rejected") {
                    Button(onClick = onEdit) { Text("修改后重新提交") }
                }
            }
        }
    }
}

@Composable
private fun ApprovalProgress(
    status: String,
    createdAt: String,
    reviewedBy: String,
    reviewedAt: String,
    cancelRequested: Boolean,
    forceReason: String
) {
    val colors = rememberSemanticColors()
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Dot(MaterialTheme.colorScheme.outline)
            Spacer(Modifier.width(6.dp))
            Text(
                "提交 ${formatTime(createdAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val dotColor = when {
                cancelRequested -> colors.warn
                status == "approved" -> colors.ok
                status == "rejected" -> colors.bad
                status == "pending" -> colors.warn
                else -> MaterialTheme.colorScheme.outline
            }
            Dot(dotColor)
            Spacer(Modifier.width(6.dp))
            Text(
                when {
                    cancelRequested && status == "approved" -> "取消待审批 · 等待店长确认"
                    status == "approved" -> "审批通过" + reviewSuffix(reviewedBy, reviewedAt)
                    status == "rejected" -> "已驳回" + reviewSuffix(reviewedBy, reviewedAt)
                    status == "withdrawn" -> "已撤回，未计入已休"
                    status == "cancelled" -> "已取消"
                    status == "pending" -> "审批中 · 等待店长处理"
                    else -> status
                } + if (forceReason.isNotBlank()) " · $forceReason" else "",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/* ---------------- 全职排休申请 ---------------- */

@Composable
private fun LeaveApplyDialog(state: ScheduleUiState, vm: ScheduleViewModel, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val leave = state.leave ?: LeaveSummary()
    var date by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("事假") }
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var askFullAttendance by remember { mutableStateOf(false) }

    LaunchedEffect(date) {
        if (date.isBlank()) vm.clearDayStats() else vm.loadDayStats(date)
    }
    DisposableEffect(Unit) {
        onDispose { vm.clearDayStats() }
    }

    fun validate(): String? {
        if (date.isBlank()) return "请选择休息日期"
        if (YearMonth.from(LocalDate.parse(date)).toString() != YearMonth.now().toString()) {
            return "排休需选择当月日期"
        }
        if (date < LocalDate.now().toString()) return "休息日期不能早于今天，请选择今天或之后的日期"
        return null
    }

    fun submit() {
        val msg = validate()
        if (msg != null) {
            error = msg
            return
        }
        error = null
        vm.applyLeave(date, type, reason.trim())
    }

    AlertDialog(
        onDismissRequest = { if (!state.actionBusy) onDismiss() },
        title = { Text("申请排休") },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    "本月应休 ${formatNumber(leave.quota)} 天，已休 ${leave.used} 天，审批中 ${leave.pending} 天。" +
                        "须选择当月日期，今天及以后均可提交。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(10.dp))
                Text("休息日期", style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(4.dp))
                OutlinedButton(
                    enabled = !state.actionBusy,
                    onClick = {
                        openDatePicker(context, date) {
                            date = it
                            error = null
                        }
                    }
                ) { Text(date.ifBlank { "选择日期" }) }

                if (date.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    val stats = state.dayStats
                    val hint = when {
                        state.dayStatsLoading -> "正在查询当天排休人数…"
                        state.dayStatsError != null -> "排休人数查询失败：${state.dayStatsError}"
                        stats != null && stats.total > 0 ->
                            "当天已有 ${stats.total} 人排休（已通过 ${stats.approved}、审批中 ${stats.pending}）"

                        stats != null -> "当天暂无排休申请"
                        else -> ""
                    }
                    Text(
                        hint,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (state.dayStatsError != null) MaterialTheme.colorScheme.error
                        else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (stats != null) {
                        Text(
                            "全店剩余 ${stats.storeRemaining} 人 · 本岗位剩余 ${stats.positionRemaining} 人",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                if (error != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(error!!, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }

                Spacer(Modifier.height(10.dp))
                Text("类型", style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("事假", "病假").forEach { option ->
                        FilterChip(
                            selected = type == option,
                            onClick = { type = option },
                            label = { Text(option) }
                        )
                    }
                }
                Text(
                    "事假、病假均占用本月月休额度；扣薪以薪资明细中的「事假/病假扣款」为准。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= 50) reason = it },
                    label = { Text("申请说明（选填）") },
                    placeholder = { Text("供店长判断当日人手，≤50 字") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
                if (state.actionBusy) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "提交中…",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !state.actionBusy,
                onClick = {
                    val msg = validate()
                    if (msg != null) {
                        error = msg
                        return@TextButton
                    }
                    if (leave.used + leave.pending + 1 > 4) {
                        askFullAttendance = true
                    } else {
                        submit()
                    }
                }
            ) { Text("提交申请") }
        },
        dismissButton = {
            TextButton(enabled = !state.actionBusy, onClick = onDismiss) { Text("取消") }
        }
    )

    if (askFullAttendance) {
        AlertDialog(
            onDismissRequest = { askFullAttendance = false },
            title = { Text("排休天数提醒") },
            text = { Text("排休已超过4天，无全勤奖金。是否仍要提交本次排休申请？提交后仍需店长按当日人手审批。") },
            confirmButton = {
                TextButton(onClick = {
                    askFullAttendance = false
                    submit()
                }) { Text("仍要提交") }
            },
            dismissButton = {
                TextButton(onClick = { askFullAttendance = false }) { Text("返回修改") }
            }
        )
    }
}

/* ---------------- 兼职排班申请 ---------------- */

private data class SlotDraft(val date: String, val start: String, val end: String)

@Composable
private fun ShiftApplyDialog(
    initial: ShiftRequestItem?,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (List<ShiftSlot>, String) -> Unit
) {
    val context = LocalContext.current
    val slotList = remember(initial?.id) {
        mutableStateListOf<SlotDraft>().apply {
            val seed = initial?.slots?.map { SlotDraft(it.date, it.start, it.end) }
            if (seed.isNullOrEmpty()) add(SlotDraft("", "17:00", "22:00")) else addAll(seed)
        }
    }
    var note by remember(initial?.id) { mutableStateOf(initial?.note.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }

    fun validate(): String? {
        if (slotList.isEmpty()) return "请至少填写一个时段"
        val currentMonth = YearMonth.now().toString()
        val today = LocalDate.now().toString()
        val byDate = mutableMapOf<String, MutableList<Pair<String, String>>>()
        slotList.forEach { slot ->
            if (slot.date.isBlank()) return "请选择上班日期"
            if (YearMonth.from(LocalDate.parse(slot.date)).toString() != currentMonth) {
                return "排班需选择当月日期"
            }
            if (slot.date < today) return "上班日期不能早于今天，请选择今天或之后的日期"
            if (slot.start.isBlank() || slot.end.isBlank()) return "请填写开始与结束时间"
            if (slot.end <= slot.start) {
                return "${formatExecDate(slot.date)} 的结束时间需晚于开始时间"
            }
            byDate.getOrPut(slot.date) { mutableListOf() }.forEach { iv ->
                if (slot.start < iv.second && slot.end > iv.first) {
                    return "${formatExecDate(slot.date)} 的时段存在重叠"
                }
            }
            byDate.getValue(slot.date).add(slot.start to slot.end)
        }
        return null
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (initial != null) "修改排班并重新提交" else "申请排班") },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 470.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    "填写可上班的日期与具体时段，可一次提交多个日期/时段；可选择今天及以后的当月日期。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                slotList.forEachIndexed { index, slot ->
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)
                    ) {
                        Column(modifier = Modifier.padding(8.dp)) {
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.horizontalScroll(rememberScrollState())
                            ) {
                                OutlinedButton(
                                    enabled = !busy,
                                    onClick = {
                                        openDatePicker(context, slot.date) { picked ->
                                            slotList[index] = slot.copy(date = picked)
                                            error = null
                                        }
                                    }
                                ) { Text(slot.date.ifBlank { "日期" }) }
                                OutlinedButton(
                                    enabled = !busy,
                                    onClick = {
                                        openTimePicker(context, slot.start) { picked ->
                                            slotList[index] = slot.copy(start = picked)
                                            error = null
                                        }
                                    }
                                ) { Text(slot.start.ifBlank { "开始" }) }
                                OutlinedButton(
                                    enabled = !busy,
                                    onClick = {
                                        openTimePicker(context, slot.end) { picked ->
                                            slotList[index] = slot.copy(end = picked)
                                            error = null
                                        }
                                    }
                                ) { Text(slot.end.ifBlank { "结束" }) }
                            }
                            if (slotList.size > 1) {
                                TextButton(
                                    enabled = !busy,
                                    onClick = { slotList.removeAt(index) }
                                ) { Text("删除本时段") }
                            }
                        }
                    }
                }
                TextButton(
                    enabled = !busy,
                    onClick = { slotList.add(SlotDraft("", "17:00", "22:00")) }
                ) { Text("+ 添加时段") }

                if (error != null) {
                    Text(error!!, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }

                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= 100) note = it },
                    label = { Text("补充说明（选填）") },
                    placeholder = { Text("例如：周末可全天到店、可临时顶班") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
                if (busy) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "提交中…",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy,
                onClick = {
                    val msg = validate()
                    if (msg != null) {
                        error = msg
                        return@TextButton
                    }
                    error = null
                    onSubmit(
                        slotList.map { ShiftSlot(it.date, it.start, it.end) },
                        note.trim()
                    )
                }
            ) { Text("提交申请") }
        },
        dismissButton = {
            TextButton(enabled = !busy, onClick = onDismiss) { Text("取消") }
        }
    )
}

/* ---------------- 工具 ---------------- */

private fun openDatePicker(
    context: android.content.Context,
    initial: String,
    onPick: (String) -> Unit
) {
    val base = runCatching { LocalDate.parse(initial) }.getOrDefault(LocalDate.now())
    val dialog = DatePickerDialog(
        context,
        { _, year, month, day -> onPick(LocalDate.of(year, month + 1, day).toString()) },
        base.year,
        base.monthValue - 1,
        base.dayOfMonth
    )
    val zone = ZoneId.systemDefault()
    dialog.datePicker.minDate = LocalDate.now().atStartOfDay(zone).toInstant().toEpochMilli()
    dialog.datePicker.maxDate = YearMonth.now().atEndOfMonth().atTime(23, 59, 59)
        .atZone(zone).toInstant().toEpochMilli()
    dialog.show()
}

private fun openTimePicker(context: android.content.Context, initial: String, onPick: (String) -> Unit) {
    val parts = initial.split(":")
    val hour = parts.getOrNull(0)?.toIntOrNull() ?: 17
    val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
    TimePickerDialog(context, { _, h, m -> onPick("%02d:%02d".format(h, m)) }, hour, minute, true).show()
}

private fun monthLabel(): String {
    val now = YearMonth.now()
    return "${now.year}年${now.monthValue}月"
}

private fun formatNumber(value: Double): String =
    if (value == value.toInt().toDouble()) value.toInt().toString() else value.toString()

private fun reviewSuffix(reviewedBy: String, reviewedAt: String): String {
    val who = reviewedBy.ifBlank { "店长" }
    val time = formatTime(reviewedAt)
    return if (time.isBlank()) " · $who" else " · $who $time"
}

private fun hoursSince(iso: String): Long {
    if (iso.isBlank()) return 0
    val instant = runCatching { OffsetDateTime.parse(iso).toInstant() }
        .recoverCatching {
            LocalDateTime.parse(iso.take(19)).atZone(ZoneId.systemDefault()).toInstant()
        }
        .getOrNull() ?: return 0
    return ChronoUnit.HOURS.between(instant, java.time.Instant.now())
}

private fun leaveStatus(item: LeaveItem): Pair<String, BadgeKind> {
    if (item.cancelRequested && item.status == "approved") return "取消待审批" to BadgeKind.Warn
    return when (item.status) {
        "pending" -> "待审批" to BadgeKind.Warn
        "approved" -> "已通过" to BadgeKind.Ok
        "rejected" -> "已驳回" to BadgeKind.Bad
        "withdrawn" -> "已撤回" to BadgeKind.Neutral
        "cancelled" -> "已取消" to BadgeKind.Neutral
        else -> item.status to BadgeKind.Neutral
    }
}

private fun shiftStatus(item: ShiftRequestItem): Pair<String, BadgeKind> {
    if (item.cancelRequested && item.status == "approved") return "取消待审批" to BadgeKind.Warn
    return when (item.status) {
        "pending" -> "待审批" to BadgeKind.Warn
        "approved" -> "已通过" to BadgeKind.Ok
        "rejected" -> "已驳回" to BadgeKind.Bad
        "withdrawn" -> "已撤回" to BadgeKind.Neutral
        "cancelled" -> "已取消" to BadgeKind.Neutral
        else -> item.status to BadgeKind.Neutral
    }
}
