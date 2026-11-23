package com.tastien.storestaff.nativeapp.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tastien.storestaff.nativeapp.data.HomeSnapshot
import com.tastien.storestaff.nativeapp.ui.components.ShiftTodayCard
import java.time.LocalTime

@Composable
fun HomeScreen(
    state: HomeUiState,
    onRefresh: () -> Unit,
    onOpenSchedule: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenMessages: () -> Unit,
    onOpenFeature: (String) -> Unit,
    unreadCount: Int
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Spacer(Modifier.height(12.dp))
        HeaderRow(
            snapshot = state.snapshot,
            refreshing = state.refreshing,
            onRefresh = onRefresh,
            onOpenProfile = onOpenProfile,
            onOpenMessages = onOpenMessages,
            unreadCount = unreadCount
        )

        when {
            state.loading && state.snapshot == null -> {
                Box(
                    modifier = Modifier.fillMaxWidth().height(220.dp),
                    contentAlignment = Alignment.Center
                ) { CircularProgressIndicator() }
            }

            state.snapshot == null -> {
                Spacer(Modifier.height(16.dp))
                ErrorCard(message = state.error ?: "加载失败", onRetry = onRefresh)
            }

            else -> {
                val snapshot = state.snapshot
                Spacer(Modifier.height(14.dp))
                ShiftTodayCard(
                    shift = snapshot.shift,
                    dateText = snapshot.today,
                    onClick = onOpenSchedule
                )
                Spacer(Modifier.height(12.dp))
                MetricsRow(snapshot)
                Spacer(Modifier.height(18.dp))
                QuickActions(onOpenSchedule = onOpenSchedule, onOpenFeature = onOpenFeature)
            }
        }

        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun HeaderRow(
    snapshot: HomeSnapshot?,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenMessages: () -> Unit,
    unreadCount: Int
) {
    val displayName = snapshot?.displayName ?: "门店伙伴"
    val greeting = when (LocalTime.now().hour) {
        in 5..11 -> "早上好"
        in 12..17 -> "下午好"
        else -> "晚上好"
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
                .clickable(onClick = onOpenProfile),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = displayName.take(1),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 16.sp
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "$greeting，$displayName",
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                text = snapshot?.storeName?.ifBlank { "塔斯汀门店" } ?: "塔斯汀门店",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (refreshing) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
        } else {
            IconButton(onClick = onRefresh) {
                Icon(
                    imageVector = Icons.Outlined.Refresh,
                    contentDescription = "刷新",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        IconButton(onClick = onOpenMessages) {
            BadgedBox(
                badge = {
                    if (unreadCount > 0) {
                        Badge {
                            Text(if (unreadCount > 99) "99+" else "$unreadCount", fontSize = 10.sp)
                        }
                    }
                }
            ) {
                Icon(
                    imageVector = Icons.Outlined.Notifications,
                    contentDescription = "消息",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun MetricsRow(snapshot: HomeSnapshot) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricCard(
            title = "待办任务",
            value = snapshot.todayPending.toString(),
            hint = if (snapshot.overdue > 0) "逾期 ${snapshot.overdue} 项" else "今日到期",
            hintColor = if (snapshot.overdue > 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        MetricCard(
            title = "未读通知",
            value = snapshot.unread.toString(),
            hint = "私信与公告",
            hintColor = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun MetricCard(
    title: String,
    value: String,
    hint: String,
    hintColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(6.dp))
            Text(
                value,
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(Modifier.height(2.dp))
            Text(hint, style = MaterialTheme.typography.labelSmall, color = hintColor)
        }
    }
}

@Composable
private fun QuickActions(onOpenSchedule: () -> Unit, onOpenFeature: (String) -> Unit) {
    Column {
        Text("全部功能", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QuickTile(
                "排休 / 排班",
                hint = "申请与审批进度",
                modifier = Modifier.weight(1f),
                onClick = onOpenSchedule
            )
            QuickTile(
                "我的考勤",
                hint = "月度工时与异常",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("attendance") }
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QuickTile(
                "我的薪资",
                hint = "工资单与发放状态",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("salary") }
            )
            QuickTile(
                "量化分",
                hint = "维度得分与加减分",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("score") }
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QuickTile(
                "我的报销",
                hint = "提交与审批进度",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("reimburse") }
            )
            QuickTile(
                "门店通讯录",
                hint = "同事电话与私信",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("contacts") }
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            QuickTile(
                "我的日程",
                hint = "个人与门店日程",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("agenda") }
            )
            QuickTile(
                "通知公告 / 信箱",
                hint = "公告与私信会话",
                modifier = Modifier.weight(1f),
                onClick = { onOpenFeature("messages") }
            )
        }
    }
}

@Composable
private fun QuickTile(
    title: String,
    hint: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    Card(
        modifier = modifier.then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            Text(
                hint,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text("加载失败", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.height(6.dp))
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onRetry) {
                Text("重试", color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
