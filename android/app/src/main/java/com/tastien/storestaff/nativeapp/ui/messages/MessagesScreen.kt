package com.tastien.storestaff.nativeapp.ui.messages

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tastien.storestaff.nativeapp.data.MessageItem
import com.tastien.storestaff.nativeapp.data.MessagePage
import com.tastien.storestaff.nativeapp.data.ThreadItem
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.formatTime
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors

@Composable
fun MessagesScreen(
    state: MessagesUiState,
    vm: MessagesViewModel,
    onOpenLink: (link: String, refId: String, hint: String) -> Unit,
    onBack: (() -> Unit)? = null
) {
    val context = LocalContext.current
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    if (onBack != null) {
        BackHandler(onBack = onBack)
    }

    val conversation = state.conversation
    if (conversation != null) {
        ConversationScreen(
            state = conversation,
            onBack = { vm.closeConversation() },
            onRetry = { vm.retryConversation() },
            onSend = { vm.send(it) },
            onClearSendError = { vm.clearSendError() }
        )
        return
    }

    val unreadTotal = state.unreadSystem + state.unreadTask + state.unreadPrivate
    Column(modifier = Modifier.fillMaxSize()) {
        MessagesHeader(unreadTotal, onReadAll = { vm.markAllRead() }, onBack = onBack)
        ScopeTabs(state) { vm.selectScope(it) }
        Spacer(Modifier.height(4.dp))

        Box(modifier = Modifier.weight(1f)) {
            when (state.scope) {
                MessageScope.Private -> ThreadList(
                    state = state,
                    onOpen = { vm.openThread(it) },
                    onRetry = { vm.loadCurrentPage() }
                )

                else -> MessageList(
                    state = state,
                    onOpen = { vm.openMessage(it) },
                    onPrev = { state.page?.let { vm.goPage(it.page - 1) } },
                    onNext = { state.page?.let { vm.goPage(it.page + 1) } },
                    onRetry = { vm.loadCurrentPage() }
                )
            }
        }
    }

    state.detail?.let { item ->
        MessageDetailDialog(
            item = item,
            onOpenLink = { link, refId ->
                val hint = if (item.type == "task") item.body.substringBefore("（").trim() else ""
                vm.closeDetail()
                onOpenLink(link, refId, hint)
            },
            onDismiss = { vm.closeDetail() }
        )
    }
}

@Composable
private fun MessagesHeader(unread: Int, onReadAll: () -> Unit, onBack: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (onBack != null) {
            IconButton(onClick = onBack, modifier = Modifier.padding(end = 4.dp)) {
                Icon(
                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "返回",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text("消息", style = MaterialTheme.typography.headlineSmall)
            Text(
                if (unread > 0) "未读 $unread 条" else "暂无未读消息",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        TextButton(enabled = unread > 0, onClick = onReadAll) { Text("全部已读") }
    }
}

@Composable
private fun ScopeTabs(state: MessagesUiState, onSelect: (MessageScope) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        MessageScope.entries.forEach { scope ->
            val selected = state.scope == scope
            val unread = when (scope) {
                MessageScope.System -> state.unreadSystem
                MessageScope.Task -> state.unreadTask
                MessageScope.Private -> state.unreadPrivate
            }
            Surface(
                modifier = Modifier.weight(1f).clickable { onSelect(scope) },
                shape = MaterialTheme.shapes.small,
                color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                contentColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
            ) {
                Row(
                    modifier = Modifier.padding(vertical = 9.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        scope.label,
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1
                    )
                    if (unread > 0) {
                        Spacer(Modifier.width(4.dp))
                        UnreadBadge(unread)
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageList(
    state: MessagesUiState,
    onOpen: (MessageItem) -> Unit,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onRetry: () -> Unit
) {
    val page = state.page
    when {
        state.listLoading && page == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        page == null && state.listError != null -> ErrorState(state.listError, onRetry)

        page == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        else -> Column(modifier = Modifier.fillMaxSize()) {
            if (state.listLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            if (page.items.isEmpty()) {
                EmptyState(
                    title = if (state.scope == MessageScope.Task) "暂无任务通知" else "暂无系统通知",
                    hint = "新的通知会出现在这里。"
                )
                Spacer(Modifier.weight(1f))
            } else {
                val listState = rememberLazyListState()
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(page.items, key = { it.id }) { item ->
                        MessageRow(item) { onOpen(item) }
                    }
                }
            }
            PagerBar(page, onPrev, onNext)
        }
    }
}

@Composable
private fun MessageRow(item: MessageItem, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!item.read) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    item.title,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = if (item.read) FontWeight.Normal else FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    formatTime(item.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (item.body.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    item.body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun PagerBar(page: MessagePage, onPrev: () -> Unit, onNext: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(enabled = page.page > 1, onClick = onPrev) { Text("上一页") }
        Text(
            "第 ${page.page}/${page.totalPages} 页 · 共 ${page.total} 条",
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TextButton(enabled = page.page < page.totalPages, onClick = onNext) { Text("下一页") }
    }
}

@Composable
private fun ThreadList(state: MessagesUiState, onOpen: (ThreadItem) -> Unit, onRetry: () -> Unit) {
    val threads = state.threads
    when {
        state.threadsLoading && threads == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        threads == null && state.threadsError != null -> ErrorState(state.threadsError, onRetry)

        threads == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        threads.isEmpty() -> EmptyState(
            title = "暂无私信",
            hint = "店长或同事发来的私信会显示在这里。"
        )

        else -> {
            val listState = rememberLazyListState()
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(threads, key = { it.id }) { thread ->
                    ThreadRow(thread) { onOpen(thread) }
                }
            }
        }
    }
}

@Composable
private fun ThreadRow(thread: ThreadItem, onClick: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    thread.peerName.take(1).ifBlank { "私" },
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        thread.peerName.ifBlank { "同事" },
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        formatTime(thread.lastAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        (if (thread.lastIsMine) "我：" else "") + thread.lastText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    if (thread.unread > 0) {
                        Spacer(Modifier.width(6.dp))
                        UnreadBadge(thread.unread)
                    }
                }
            }
        }
    }
}

@Composable
private fun UnreadBadge(count: Int) {
    val colors = rememberSemanticColors()
    Box(
        modifier = Modifier
            .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
            .background(colors.bad, CircleShape)
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            if (count > 99) "99+" else "$count",
            color = Color.White,
            fontSize = 10.sp,
            maxLines = 1
        )
    }
}

@Composable
private fun MessageDetailDialog(
    item: MessageItem,
    onOpenLink: (String, String) -> Unit,
    onDismiss: () -> Unit
) {
    val link = item.link
    val taskLink = link.contains("tasks") || item.type == "task"
    val scheduleLink = link.contains("schedule") || link.contains("leave")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.title) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 420.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    formatTime(item.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                Text(item.body.ifBlank { "（无正文）" }, style = MaterialTheme.typography.bodyMedium)
            }
        },
        confirmButton = {
            Row {
                if (scheduleLink) {
                    TextButton(onClick = { onOpenLink(link, item.refId) }) { Text("查看排班") }
                }
                if (taskLink) {
                    TextButton(onClick = { onOpenLink(link.ifBlank { "tasks.html" }, item.refId) }) {
                        Text("查看任务")
                    }
                }
                TextButton(onClick = onDismiss) { Text("关闭") }
            }
        }
    )
}
