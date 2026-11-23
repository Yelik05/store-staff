package com.tastien.storestaff.nativeapp.ui.messages

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tastien.storestaff.nativeapp.data.MessageItem
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState
import com.tastien.storestaff.nativeapp.ui.components.formatTime
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors

@Composable
fun ConversationScreen(
    state: ConversationUiState,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onSend: (String) -> Unit,
    onClearSendError: () -> Unit
) {
    BackHandler(onBack = onBack)
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val colors = rememberSemanticColors()

    LaunchedEffect(state.messages.size) {
        if (state.messages.isEmpty()) return@LaunchedEffect
        val last = state.messages.lastOrNull()
        if (last?.isMine == true && !state.sending && last.body == input.trim()) {
            input = ""
        }
        listState.animateScrollToItem(state.messages.lastIndex)
    }

    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    state.peerName.ifBlank { "私信" },
                    style = MaterialTheme.typography.titleLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "共 ${state.messages.size} 条",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }

                state.error != null -> ErrorState(state.error, onRetry)

                state.messages.isEmpty() -> EmptyState(
                    title = "还没有消息",
                    hint = "发一条消息打个招呼吧。"
                )

                else -> LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    itemsIndexed(state.messages) { _, message ->
                        MessageBubble(message)
                    }
                }
            }
        }

        state.sendError?.let { error ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.bad,
                    modifier = Modifier.weight(1f)
                )
                TextButton(onClick = onClearSendError) { Text("知道了") }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = { if (it.length <= 500) input = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("输入消息…") },
                maxLines = 4,
                shape = MaterialTheme.shapes.medium,
                enabled = !state.sending
            )
            Spacer(Modifier.width(8.dp))
            Button(
                enabled = input.isNotBlank() && !state.sending,
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 10.dp),
                onClick = { onSend(input) }
            ) {
                Text(if (state.sending) "发送中" else "发送")
            }
        }
    }
}

@Composable
private fun MessageBubble(message: MessageItem) {
    val mine = message.isMine
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start
    ) {
        Column(
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
            modifier = Modifier.widthIn(max = 290.dp)
        ) {
            Surface(
                color = if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                contentColor = if (mine) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                shape = RoundedCornerShape(
                    topStart = 12.dp,
                    topEnd = 12.dp,
                    bottomStart = if (mine) 12.dp else 2.dp,
                    bottomEnd = if (mine) 2.dp else 12.dp
                )
            ) {
                Text(
                    message.body,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Normal
                )
            }
            Text(
                formatTime(message.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, start = 2.dp, end = 2.dp)
            )
        }
    }
}
