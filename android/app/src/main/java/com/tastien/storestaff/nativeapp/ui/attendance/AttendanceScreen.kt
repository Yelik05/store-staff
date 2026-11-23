package com.tastien.storestaff.nativeapp.ui.attendance

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tastien.storestaff.nativeapp.data.AttendanceDay
import com.tastien.storestaff.nativeapp.data.AttendanceMonth
import com.tastien.storestaff.nativeapp.data.AttendanceSegment
import com.tastien.storestaff.nativeapp.data.AttendanceSummary
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import java.util.Locale

@Composable
fun AttendanceScreen(
    state: AttendanceUiState,
    vm: AttendanceViewModel,
    onBack: () -> Unit
) {
    BackHandler(onBack = onBack)
    Column(modifier = Modifier.fillMaxSize()) {
        AttendanceHeader(onBack)
        MonthBar(state.month, onPrev = { vm.prevMonth() }, onNext = { vm.nextMonth() })
        val data = state.data
        val error = state.error
        when {
            data == null && error != null -> ErrorState(error, onRetry = { vm.retry() })
            data == null -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            else -> AttendanceBody(data)
        }
    }
}

@Composable
private fun AttendanceHeader(onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(
                Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "返回"
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text("考勤", style = MaterialTheme.typography.titleLarge)
            Text(
                "月度出勤与异常明细",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun MonthBar(month: String, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(onClick = onPrev) { Text("‹", fontSize = 22.sp) }
        Text(
            month,
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium
        )
        TextButton(onClick = onNext) { Text("›", fontSize = 22.sp) }
    }
}

@Composable
private fun AttendanceBody(data: AttendanceMonth) {
    var expanded by remember(data.month) { mutableStateOf(emptySet<String>()) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item { SummaryCard(data.summary) }
        if (data.days.isEmpty()) {
            item {
                EmptyState(
                    title = "本月暂无考勤记录",
                    hint = "有打卡记录后会自动显示在这里。"
                )
            }
        } else {
            items(data.days, key = { it.date }) { day ->
                DayCard(
                    day = day,
                    expanded = expanded.contains(day.date),
                    onToggle = {
                        expanded = if (expanded.contains(day.date)) expanded - day.date else expanded + day.date
                    }
                )
            }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun SummaryCard(summary: AttendanceSummary) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StatCell(
                label = "出勤天数",
                value = summary.workDays.toString(),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            StatDivider()
            StatCell(
                label = "总工时",
                value = fmtHours(summary.totalHours),
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            StatDivider()
            StatCell(
                label = "异常次数",
                value = summary.abnormalCount.toString(),
                color = if (summary.abnormalCount > 0) colors.bad else colors.ok,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@Composable
private fun StatCell(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.SemiBold,
            color = color
        )
        Spacer(Modifier.height(2.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun StatDivider() {
    Box(
        modifier = Modifier
            .width(0.5.dp)
            .height(34.dp)
            .background(MaterialTheme.colorScheme.outlineVariant)
    )
}

@Composable
private fun DayCard(day: AttendanceDay, expanded: Boolean, onToggle: () -> Unit) {
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        day.date,
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.weight(1f)
                    )
                    StatusBadge(
                        text = if (day.abnormal) "异常" else "正常",
                        kind = if (day.abnormal) BadgeKind.Bad else BadgeKind.Ok
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "工时 ${fmtHours(day.totalHours)} 小时 · ${day.segments.size} 个时段",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (expanded) {
                HorizontalDivider(
                    color = MaterialTheme.colorScheme.outline,
                    thickness = 0.5.dp
                )
                Column(modifier = Modifier.padding(14.dp)) {
                    if (day.segments.isEmpty()) {
                        Text(
                            "无时段记录",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        day.segments.forEachIndexed { index, segment ->
                            if (index > 0) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(vertical = 10.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant,
                                    thickness = 0.5.dp
                                )
                            }
                            SegmentBlock(segment)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SegmentBlock(segment: AttendanceSegment) {
    val colors = rememberSemanticColors()
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "时段 ${segment.segmentNo}",
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            if (segment.hourDiff != 0.0) {
                Text(
                    (if (segment.hourDiff > 0) "+" else "") + fmtHours(segment.hourDiff) + "h",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (segment.hourDiff < 0) colors.bad else colors.ok
                )
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "计划 ${timeRange(segment.plannedIn, segment.plannedOut)} · 计薪 ${fmtHours(segment.plannedWorkHours)}h",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (segment.mealHours != 0.0) {
            Text(
                "用餐扣除 ${fmtHours(segment.mealHours)}h",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            "打卡 ${timeRange(segment.clockIn, segment.clockOut)} · 实计 ${fmtHours(segment.actualHours)}h",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (segment.confirmIn.isNotBlank() || segment.confirmOut.isNotBlank()) {
            Text(
                "确认 ${timeRange(segment.confirmIn, segment.confirmOut)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (segment.tags.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                segment.tags.forEach { tag ->
                    StatusBadge(tag.text, tagKind(tag.cls))
                }
            }
        }
    }
}

private fun timeRange(start: String, end: String): String {
    if (start.isBlank() && end.isBlank()) return "—"
    return "${start.ifBlank { "—" }}–${end.ifBlank { "—" }}"
}

private fun fmtHours(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString()
    else String.format(Locale.US, "%.1f", value)

private fun tagKind(cls: String): BadgeKind {
    val key = cls.lowercase()
    return when {
        key.contains("bad") || key.contains("danger") || key.contains("error") -> BadgeKind.Bad
        key.contains("warn") -> BadgeKind.Warn
        key.contains("ok") || key.contains("good") || key.contains("success") -> BadgeKind.Ok
        key.contains("info") -> BadgeKind.Info
        else -> BadgeKind.Neutral
    }
}
