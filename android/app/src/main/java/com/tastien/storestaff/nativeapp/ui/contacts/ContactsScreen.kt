package com.tastien.storestaff.nativeapp.ui.contacts

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tastien.storestaff.nativeapp.data.ContactStaff
import com.tastien.storestaff.nativeapp.ui.components.EmptyState
import com.tastien.storestaff.nativeapp.ui.components.ErrorState

private const val PAGE_SIZE = 20

@Composable
fun ContactsScreen(state: ContactsUiState, vm: ContactsViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    BackHandler(onBack = onBack)
    LaunchedEffect(state.flash) {
        state.flash?.let {
            Toast.makeText(context, it.text, Toast.LENGTH_SHORT).show()
            vm.clearFlash()
        }
    }

    val filtered = remember(state.list, state.query) { filterContacts(state.list, state.query) }
    val pageCount = ((filtered.size + PAGE_SIZE - 1) / PAGE_SIZE).coerceAtLeast(1)
    val page = state.page.coerceIn(1, pageCount)
    val visible = filtered.drop((page - 1) * PAGE_SIZE).take(PAGE_SIZE)

    Column(modifier = Modifier.fillMaxSize()) {
        ContactsHeader(state, onBack)
        SearchBox(state.query) { vm.setQuery(it) }
        Spacer(Modifier.height(6.dp))

        when {
            state.loading && state.list.isEmpty() -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) { CircularProgressIndicator() }

            state.error != null && state.list.isEmpty() -> ErrorState(state.error, { vm.retry() })

            state.list.isEmpty() -> EmptyState(
                title = "暂无通讯录数据",
                hint = "门店在职员工信息会显示在这里。"
            )

            filtered.isEmpty() -> EmptyState(
                title = "没有匹配的同事",
                hint = "试试更换姓名、岗位或工号关键词。"
            )

            else -> Column(modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(visible, key = { it.id }) { staff ->
                        StaffCard(staff) { vm.openDetail(staff) }
                    }
                    item { Spacer(Modifier.height(6.dp)) }
                }
                if (pageCount > 1) {
                    PagerBar(page, pageCount, filtered.size) { vm.goPage(it) }
                }
            }
        }
    }

    state.detail?.let { staff ->
        StaffDetailDialog(
            staff = staff,
            sending = state.sending,
            sendError = state.sendError,
            onSend = { vm.sendPrivate(it) },
            onDismiss = { vm.closeDetail() }
        )
    }
}

/* ---------------- 头部与搜索 ---------------- */

@Composable
private fun ContactsHeader(state: ContactsUiState, onBack: () -> Unit) {
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
            Text("门店通讯录", style = MaterialTheme.typography.headlineSmall)
            Text(
                state.storeName.ifBlank { "点击同事查看电话与私信" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (state.list.isNotEmpty()) {
            Text(
                "${state.list.size} 人",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun SearchBox(query: String, onQuery: (String) -> Unit) {
    OutlinedTextField(
        value = query,
        onValueChange = onQuery,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        placeholder = { Text("搜索姓名 / 岗位 / 手机号 / 工号") },
        leadingIcon = {
            Icon(
                Icons.Outlined.Search,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingIcon = if (query.isNotBlank()) {
            {
                IconButton(onClick = { onQuery("") }) {
                    Icon(Icons.Outlined.Close, contentDescription = "清空")
                }
            }
        } else {
            null
        },
        singleLine = true
    )
}

/* ---------------- 列表 ---------------- */

@Composable
private fun StaffCard(staff: ContactStaff, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    staff.name.take(1).ifBlank { "员" },
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 18.sp
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        staff.name.ifBlank { "同事" },
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (staff.nickname.isNotBlank()) {
                        Spacer(Modifier.width(6.dp))
                        Text(
                            "（${staff.nickname}）",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Text(
                    staff.position.ifBlank { "员工" },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                val meta = listOfNotNull(
                    staff.phone.takeIf { it.isNotBlank() }?.let { "电话 $it" },
                    staff.empNo.takeIf { it.isNotBlank() }?.let { "工号 $it" }
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        meta,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun PagerBar(page: Int, pageCount: Int, total: Int, onPage: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(enabled = page > 1, onClick = { onPage(page - 1) }) { Text("上一页") }
        Text(
            "第 $page/$pageCount 页 · 共 $total 人",
            modifier = Modifier.weight(1f),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        TextButton(enabled = page < pageCount, onClick = { onPage(page + 1) }) { Text("下一页") }
    }
}

/* ---------------- 详情与私信 ---------------- */

@Composable
private fun StaffDetailDialog(
    staff: ContactStaff,
    sending: Boolean,
    sendError: String?,
    onSend: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    var message by remember(staff.id) { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!sending) onDismiss() },
        title = { Text(staff.name.ifBlank { "同事" }) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                InfoLine("岗位", staff.position.ifBlank { "—" })
                InfoLine("手机号", staff.phone.ifBlank { "—" })
                InfoLine("工号", staff.empNo.ifBlank { "—" })
                if (staff.feishuEmpNo.isNotBlank()) InfoLine("飞书工号", staff.feishuEmpNo)
                if (staff.employmentType.isNotBlank()) InfoLine("用工类型", staff.employmentType)
                if (staff.nickname.isNotBlank()) InfoLine("昵称", staff.nickname)

                Spacer(Modifier.height(12.dp))
                Text(
                    "发私信",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(4.dp))
                OutlinedTextField(
                    value = message,
                    onValueChange = { if (it.length <= 500) message = it },
                    enabled = !sending,
                    placeholder = { Text("输入私信内容（≤500 字）") },
                    maxLines = 3,
                    modifier = Modifier.fillMaxWidth()
                )
                if (sendError != null) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        sendError,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !sending && message.isNotBlank(),
                onClick = { onSend(message) }
            ) { Text(if (sending) "发送中…" else "发送私信") }
        },
        dismissButton = {
            Row {
                TextButton(
                    enabled = !sending,
                    onClick = { dial(context, staff.phone) }
                ) { Text("拨打电话") }
                TextButton(enabled = !sending, onClick = onDismiss) { Text("关闭") }
            }
        }
    )
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(
            label,
            modifier = Modifier.width(60.dp),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(value, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
    }
}

/* ---------------- 工具 ---------------- */

private fun filterContacts(list: List<ContactStaff>, query: String): List<ContactStaff> {
    val keyword = query.trim()
    if (keyword.isBlank()) return list
    return list.filter { staff ->
        listOf(
            staff.name,
            staff.nickname,
            staff.position,
            staff.phone,
            staff.empNo,
            staff.feishuEmpNo
        ).any { it.contains(keyword, ignoreCase = true) }
    }
}

/** 拨号盘：只拉起系统拨号页，失败静默。 */
private fun dial(context: Context, phone: String) {
    if (phone.isBlank()) return
    runCatching {
        context.startActivity(Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", phone, null)))
    }
}
