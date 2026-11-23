package com.tastien.storestaff.nativeapp.ui.score

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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tastien.storestaff.nativeapp.data.ScoreDimensionDef
import com.tastien.storestaff.nativeapp.data.ScoreRecord
import com.tastien.storestaff.nativeapp.ui.components.BadgeKind
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.StatusBadge
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import java.util.Locale

@Composable
fun ScoreScreen(
    state: ScoreUiState,
    vm: ScoreViewModel,
    onBack: () -> Unit
) {
    BackHandler(onBack = onBack)
    Column(modifier = Modifier.fillMaxSize()) {
        ScoreHeader(onBack)
        val error = state.error
        when {
            state.loading && state.months.isEmpty() -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            state.months.isEmpty() && error != null ->
                ErrorState(error, onRetry = { vm.retry() })

            state.months.isEmpty() -> EmptyState(
                title = "暂无量化分记录",
                hint = "月度量化分发布后会显示在这里。"
            )

            else -> {
                MonthBar(
                    months = state.months,
                    selected = state.selectedMonth,
                    onSelect = { vm.selectMonth(it) }
                )
                Spacer(Modifier.height(8.dp))
                val record = state.record
                Box(modifier = Modifier.weight(1f)) {
                    when {
                        state.detailLoading -> Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) { CircularProgressIndicator() }

                        error != null -> ErrorState(error, onRetry = { vm.retry() })

                        record == null -> EmptyState(
                            title = "该月暂无量化分",
                            hint = "可切换其他月份查看。"
                        )

                        else -> ScoreBody(record, state.dimensions)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScoreHeader(onBack: () -> Unit) {
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
            Text("量化分", style = MaterialTheme.typography.titleLarge)
            Text(
                "维度得分与加减分明细",
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
private fun ScoreBody(record: ScoreRecord, dimensions: List<ScoreDimensionDef>) {
    val colors = rememberSemanticColors()
    val grade = record.grade.ifBlank { gradeLabel(record.total) }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            fmtScore(record.total),
                            style = MaterialTheme.typography.headlineLarge,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            "/100",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 2.dp, bottom = 4.dp)
                        )
                        Spacer(Modifier.weight(1f))
                        StatusBadge(grade, gradeKind(record.total))
                    }
                    Spacer(Modifier.height(10.dp))
                    ProgressBar(
                        ratio = (record.total / 100.0).toFloat(),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("维度得分", style = MaterialTheme.typography.titleMedium)
                    if (record.dims.isEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "暂无维度得分",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        record.dims.forEach { dim ->
                            Spacer(Modifier.height(10.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    dim.name.ifBlank { dim.key },
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    "${fmtScore(dim.score)}/${fmtScore(dim.full)}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Spacer(Modifier.height(4.dp))
                            ProgressBar(
                                ratio = if (dim.full <= 0.0) 0f else (dim.score / dim.full).toFloat(),
                                modifier = Modifier.fillMaxWidth()
                            )
                            val desc = dimensionDesc(dim.key, dim.name, dimensions)
                            if (desc.isNotBlank()) {
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    desc,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = MaterialTheme.shapes.medium,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("加减分明细", style = MaterialTheme.typography.titleMedium)
                    if (record.adjust.isEmpty()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "本月无加减分",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        record.adjust.forEachIndexed { index, adjust ->
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
                                    adjust.reason.ifBlank { "调整" },
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.weight(1f)
                                )
                                Text(
                                    (if (adjust.score >= 0) "+" else "") + fmtScore(adjust.score),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = if (adjust.score >= 0) colors.ok else colors.bad
                                )
                            }
                        }
                    }
                }
            }
        }

        if (record.publishAt.isNotBlank() || record.updatedAt.isNotBlank()) {
            item {
                Column(modifier = Modifier.padding(horizontal = 4.dp)) {
                    if (record.publishAt.isNotBlank()) {
                        Text(
                            "发布 ${stamp(record.publishAt)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    if (record.updatedAt.isNotBlank()) {
                        Text(
                            "更新 ${stamp(record.updatedAt)}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        item { Spacer(Modifier.height(12.dp)) }
    }
}

@Composable
private fun ProgressBar(ratio: Float, modifier: Modifier = Modifier) {
    val clamped = ratio.coerceIn(0f, 1f)
    Box(
        modifier = modifier
            .height(6.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(clamped)
                .background(MaterialTheme.colorScheme.primary)
        )
    }
}

private fun dimensionDesc(key: String, name: String, dimensions: List<ScoreDimensionDef>): String {
    dimensions.firstOrNull { key.isNotBlank() && it.key == key }?.let { return it.desc }
    return dimensions.firstOrNull { it.name == name }?.desc.orEmpty()
}

private fun fmtScore(value: Double): String =
    if (value == value.toLong().toDouble()) value.toLong().toString()
    else String.format(Locale.US, "%.1f", value)

private fun gradeLabel(total: Double): String = when {
    total >= 90 -> "优秀"
    total >= 80 -> "良好"
    total >= 70 -> "中等"
    total >= 60 -> "合格"
    else -> "待提升"
}

private fun gradeKind(total: Double): BadgeKind = when {
    total >= 90 -> BadgeKind.Ok
    total >= 70 -> BadgeKind.Info
    total >= 60 -> BadgeKind.Warn
    else -> BadgeKind.Bad
}

private fun stamp(raw: String): String {
    val value = raw.replace('T', ' ')
    return if (value.length >= 16) value.substring(0, 16) else value
}
