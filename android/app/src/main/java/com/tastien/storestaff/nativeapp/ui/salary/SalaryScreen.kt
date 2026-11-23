package com.tastien.storestaff.nativeapp.ui.salary

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.lazy.LazyColumn
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
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tastien.storestaff.nativeapp.data.SalaryDetail
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import java.util.Locale

@Composable
fun SalaryScreen(
    state: SalaryUiState,
    vm: SalaryViewModel,
    onBack: () -> Unit
) {
    BackHandler(onBack = onBack)
    Column(modifier = Modifier.fillMaxSize()) {
        SalaryHeader(onBack)
        val error = state.error
        when {
            state.loading && state.months.isEmpty() -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            state.months.isEmpty() && error != null ->
                ErrorState(error, onRetry = { vm.retry() })

            state.months.isEmpty() -> EmptyState(
                title = "暂无薪资记录",
                hint = "薪资发布后会显示在这里。"
            )

            else -> {
                MonthBar(
                    months = state.months,
                    selected = state.selectedMonth,
                    onSelect = { vm.selectMonth(it) }
                )
                Spacer(Modifier.height(8.dp))
                val detail = state.detail
                Box(modifier = Modifier.weight(1f)) {
                    when {
                        state.detailLoading -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) { CircularProgressIndicator() }

                        error != null -> ErrorState(error, onRetry = { vm.retry() })

                        detail == null -> EmptyState(
                            title = "该月薪资尚未发布",
                            hint = "薪资发布后会显示在这里。"
                        )

                        else -> SalaryBody(detail)
                    }
                }
            }
        }
    }
}

@Composable
private fun SalaryHeader(onBack: () -> Unit) {
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
            Text("薪资", style = MaterialTheme.typography.titleLarge)
            Text(
                "月度工资与扣款明细",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun MonthBar(months: List<String>, selected: String?, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        months.forEach { month ->
            val active = month == selected
            Surface(
                modifier = Modifier.clickable { onSelect(month) },
                shape = MaterialTheme.shapes.small,
                color = if (active) MaterialTheme.colorScheme.primaryContainer
                else MaterialTheme.colorScheme.surface,
                contentColor = if (active) MaterialTheme.colorScheme.primary
                else MaterialTheme.colorScheme.onSurfaceVariant
            ) {
                Text(
                    month,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }
    }
}

@Composable
private fun SalaryBody(detail: SalaryDetail) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { NetPayCard(detail) }
        if (detail.shouldDays > 0 || detail.actualDays > 0 || detail.totalHours > 0) {
            item { AttendanceCard(detail) }
        }
        item {
            MoneyGroupCard(
                title = "收入明细",
                rows = listOf(
                    "基本工资" to detail.baseSalary,
                    "岗位津贴" to detail.postAllowance,
                    "绩效工资" to detail.performancePay,
                    "全勤奖" to detail.fullAttendance,
                    "日常加班" to detail.dailyOvertimePay,
                    "法定节假日加班" to detail.statutoryHolidayPay,
                    "餐补" to detail.mealSubsidy,
                    "交通补贴" to detail.transportSubsidy,
                    "出勤补贴" to detail.attendanceSubsidy,
                    "社保补贴" to detail.socialSubsidy,
                    "提成" to detail.commission,
                    "应发合计" to detail.grossPay
                ),
                emptyHint = "暂无收入项",
                deduction = false
            )
        }
        item {
            MoneyGroupCard(
                title = "扣款明细",
                rows = listOf(
                    "盘点扣款" to detail.inventoryDeduction,
                    "迟到扣款" to detail.lateDeduction,
                    "考勤差异" to detail.attendanceDiff,
                    "事假/病假扣款" to detail.leaveDeduction,
                    "违纪扣款" to detail.disciplineDeduction,
                    "其他扣款" to detail.otherDeduction,
                    "社保个人部分" to detail.insurance,
                    "个人所得税" to detail.tax,
                    "扣款合计" to detail.deductionTotal
                ),
                emptyHint = "本月无扣款",
                deduction = true
            )
        }
        if (detail.payDate.isNotBlank() || detail.publishAt.isNotBlank() || detail.remark.isNotBlank()) {
            item { SalaryMetaCard(detail) }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun NetPayCard(detail: SalaryDetail) {
    val colors = rememberSemanticColors()
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "实发工资",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f)
                )
                StatusBadge(payLabel(detail.payStatus), payKind(detail.payStatus))
            }
            Spacer(Modifier.height(8.dp))
            Text(
                money(detail.netPay),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "应发 ${money(detail.grossPay)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (detail.deductionTotal > 0) {
                Text(
                    "扣款合计 ${money(detail.deductionTotal)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.bad
                )
            }
        }
    }
}

@Composable
private fun AttendanceCard(detail: SalaryDetail) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("出勤统计", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(8.dp))
            Row {
                InfoCell("应出勤", fmtDays(detail.shouldDays) + " 天", Modifier.weight(1f))
                InfoCell("实出勤", fmtDays(detail.actualDays) + " 天", Modifier.weight(1f))
                InfoCell("总工时", fmtDays(detail.totalHours) + " h", Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun InfoCell(label: String, value: String, modifier: Modifier) {
    Column(modifier = modifier) {
        Text(
            value,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun MoneyGroupCard(
    title: String,
    rows: List<Pair<String, Double>>,
    emptyHint: String,
    deduction: Boolean
) {
    val colors = rememberSemanticColors()
    val visible = rows.filter { it.second != 0.0 }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (visible.isEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    emptyHint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                visible.forEachIndexed { index, (label, value) ->
                    if (index > 0) {
                        HorizontalDivider(
                            modifier = Modifier.padding(vertical = 2.dp),
                            color = MaterialTheme.colorScheme.outlineVariant,
                            thickness = 0.5.dp
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            label,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            money(value),
                            style = MaterialTheme.typography.bodyMedium,
                            color = if (deduction) colors.bad else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SalaryMetaCard(detail: SalaryDetail) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (detail.payDate.isNotBlank()) {
                MetaRow("发放日期", detail.payDate)
            }
            if (detail.publishAt.isNotBlank()) {
                MetaRow("发布时间", stamp(detail.publishAt))
            }
            if (detail.remark.isNotBlank()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "备注",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(2.dp))
                Text(detail.remark, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MetaRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(value, style = MaterialTheme.typography.bodySmall)
    }
}

private fun money(value: Double): String = "¥" + String.format(Locale.US, "%.2f", value)

private fun fmtDays(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString()
    else String.format(Locale.US, "%.1f", value)

private fun payLabel(status: String): String = when (status) {
    "paid" -> "已发放"
    "published" -> "已发布"
    else -> status.ifBlank { "未发布" }
}

private fun payKind(status: String): BadgeKind = when (status) {
    "paid" -> BadgeKind.Ok
    "published" -> BadgeKind.Info
    else -> BadgeKind.Neutral
}

private fun stamp(raw: String): String {
    val value = raw.replace('T', ' ')
    return if (value.length >= 16) value.substring(0, 16) else value
}
