package com.tastien.storestaff.nativeapp.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.data.AccountRepository
import com.tastien.storestaff.nativeapp.notify.NotifyPrefs
import com.tastien.storestaff.nativeapp.notify.NotifyRepository
import com.tastien.storestaff.nativeapp.push.PushRegistry
import com.tastien.storestaff.nativeapp.ui.agenda.AgendaScreen
import com.tastien.storestaff.nativeapp.ui.agenda.AgendaViewModel
import com.tastien.storestaff.nativeapp.ui.attendance.AttendanceScreen
import com.tastien.storestaff.nativeapp.ui.attendance.AttendanceViewModel
import com.tastien.storestaff.nativeapp.ui.auth.LoginRoute
import com.tastien.storestaff.nativeapp.ui.components.formatTime
import com.tastien.storestaff.nativeapp.ui.contacts.ContactsScreen
import com.tastien.storestaff.nativeapp.ui.contacts.ContactsViewModel
import com.tastien.storestaff.nativeapp.ui.expiry.ExpiryScreen
import com.tastien.storestaff.nativeapp.ui.expiry.ExpiryViewModel
import com.tastien.storestaff.nativeapp.ui.home.HomeScreen
import com.tastien.storestaff.nativeapp.ui.home.HomeViewModel
import com.tastien.storestaff.nativeapp.ui.messages.MessagesScreen
import com.tastien.storestaff.nativeapp.ui.messages.MessagesViewModel
import com.tastien.storestaff.nativeapp.ui.reimburse.ReimburseScreen
import com.tastien.storestaff.nativeapp.ui.reimburse.ReimburseViewModel
import com.tastien.storestaff.nativeapp.ui.salary.SalaryScreen
import com.tastien.storestaff.nativeapp.ui.salary.SalaryViewModel
import com.tastien.storestaff.nativeapp.ui.schedule.ScheduleScreen
import com.tastien.storestaff.nativeapp.ui.schedule.ScheduleViewModel
import com.tastien.storestaff.nativeapp.ui.score.ScoreScreen
import com.tastien.storestaff.nativeapp.ui.score.ScoreViewModel
import com.tastien.storestaff.nativeapp.ui.tasks.TasksScreen
import com.tastien.storestaff.nativeapp.ui.tasks.TasksViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun AppRoot(initialRoute: String? = null) {
    val appViewModel: AppViewModel = viewModel()
    val state by appViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(Unit) { appViewModel.bootstrap() }

    when (val current = state) {
        is AppState.Checking -> LaunchScreen()

        is AppState.LoggedOut -> LoginRoute(onLoggedIn = { appViewModel.onLoginSuccess() })

        is AppState.LoggedIn -> MainScaffold(
            initialRoute = initialRoute,
            userName = current.name,
            role = current.role,
            onLogout = { appViewModel.logout() },
            onSessionExpired = { appViewModel.forceLogout() }
        )
    }
}

@Composable
private fun LaunchScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text("塔", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.height(18.dp))
            CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun MainScaffold(
    initialRoute: String?,
    userName: String,
    role: String,
    onLogout: () -> Unit,
    onSessionExpired: () -> Unit
) {
    val context = LocalContext.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    /* 全屏覆盖层：messages / profile；覆盖时隐藏底栏并支持返回首页 */
    var overlay by rememberSaveable { mutableStateOf<String?>(null) }
    /* 深链 expiryScan：直接打开效期扫码（便于真机排障） */
    var autoOpenExpiryScanner by rememberSaveable { mutableStateOf(false) }
    val saveableStateHolder = rememberSaveableStateHolder()

    val homeViewModel: HomeViewModel = viewModel(key = "home_$userName")
    val homeState by homeViewModel.state.collectAsStateWithLifecycle()

    val tasksViewModel: TasksViewModel = viewModel(key = "tasks_$userName")
    val tasksState by tasksViewModel.state.collectAsStateWithLifecycle()

    val messagesViewModel: MessagesViewModel = viewModel(key = "messages_$userName")
    val messagesState by messagesViewModel.state.collectAsStateWithLifecycle()

    val scheduleViewModel: ScheduleViewModel = viewModel(key = "schedule_$userName")
    val scheduleState by scheduleViewModel.state.collectAsStateWithLifecycle()

    val expiryViewModel: ExpiryViewModel = viewModel(key = "expiry_$userName")
    val expiryState by expiryViewModel.state.collectAsStateWithLifecycle()

    val attendanceViewModel: AttendanceViewModel = viewModel(key = "attendance_$userName")
    val attendanceState by attendanceViewModel.state.collectAsStateWithLifecycle()

    val salaryViewModel: SalaryViewModel = viewModel(key = "salary_$userName")
    val salaryState by salaryViewModel.state.collectAsStateWithLifecycle()

    val scoreViewModel: ScoreViewModel = viewModel(key = "score_$userName")
    val scoreState by scoreViewModel.state.collectAsStateWithLifecycle()

    val reimburseViewModel: ReimburseViewModel = viewModel(key = "reimburse_$userName")
    val reimburseState by reimburseViewModel.state.collectAsStateWithLifecycle()

    val contactsViewModel: ContactsViewModel = viewModel(key = "contacts_$userName")
    val contactsState by contactsViewModel.state.collectAsStateWithLifecycle()

    val agendaViewModel: AgendaViewModel = viewModel(key = "agenda_$userName")
    val agendaState by agendaViewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(initialRoute) {
        tab = 0
        overlay = null
        when (initialRoute) {
            "tasks" -> tab = 1
            "schedule", "leave" -> tab = 2
            "expiry" -> tab = 3
            "expiryScan" -> {
                tab = 3
                autoOpenExpiryScanner = true
            }
            "messages" -> overlay = "messages"
            "profile" -> overlay = "profile"
            "attendance", "salary", "score", "reimburse", "contacts", "agenda" -> overlay = initialRoute
        }
    }
    LaunchedEffect(homeState.sessionExpired) {
        if (homeState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(tasksState.sessionExpired) {
        if (tasksState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(messagesState.sessionExpired) {
        if (messagesState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(scheduleState.sessionExpired) {
        if (scheduleState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(expiryState.sessionExpired) {
        if (expiryState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(attendanceState.sessionExpired) {
        if (attendanceState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(salaryState.sessionExpired) {
        if (salaryState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(scoreState.sessionExpired) {
        if (scoreState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(reimburseState.sessionExpired) {
        if (reimburseState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(contactsState.sessionExpired) {
        if (contactsState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(agendaState.sessionExpired) {
        if (agendaState.sessionExpired) onSessionExpired()
    }
    LaunchedEffect(overlay) {
        if (overlay == "messages") messagesViewModel.refreshUnread()
    }

    /* 前台短轮询 5 分钟；后台兜底由 WorkManager 30 分钟执行 */
    LaunchedEffect(Unit) {
        PushRegistry.sync(context)
        while (isActive) {
            try {
                NotifyRepository.poll(context)
            } catch (e: Exception) {
                /* 静默：Toast 会打扰用户 */
            }
            messagesViewModel.refreshUnread()
            delay(5 * 60 * 1000L)
        }
    }

    val openMessageLink: (String, String, String) -> Unit = { link, refId, hint ->
        overlay = null
        when {
            link.contains("schedule") || link.contains("leave") -> tab = 2
            link.contains("tasks") -> {
                tab = 1
                val ref = parseTaskRef(link, refId)
                if (!ref.isNullOrBlank() || hint.isNotBlank()) {
                    tasksViewModel.focusTask(ref.orEmpty(), hint)
                }
            }
            link.contains("expiry") -> tab = 3
            link.contains("profile") -> overlay = "profile"
        }
    }

    BackHandler(enabled = overlay != null) { overlay = null }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (overlay == null) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 0.dp
                ) {
                    BottomTab.entries.forEach { item ->
                        val taskDot = item == BottomTab.Tasks &&
                            (tasksState.overview?.let { it.todayPending > 0 || it.overdueCount > 0 } == true)
                        NavigationBarItem(
                            selected = tab == item.index,
                            onClick = { tab = item.index },
                            icon = {
                                if (taskDot) {
                                    BadgedBox(badge = { Badge() }) {
                                        Icon(item.icon, contentDescription = item.label)
                                    }
                                } else {
                                    Icon(item.icon, contentDescription = item.label)
                                }
                            },
                            label = { Text(item.label, fontSize = 11.sp) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = MaterialTheme.colorScheme.primary,
                                selectedTextColor = MaterialTheme.colorScheme.primary,
                                indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (overlay) {
                "messages" -> MessagesScreen(
                    state = messagesState,
                    vm = messagesViewModel,
                    onOpenLink = openMessageLink,
                    onBack = { overlay = null }
                )

                "profile" -> ProfileScreen(
                    userName = userName,
                    role = role,
                    onBack = { overlay = null },
                    onLogout = onLogout
                )

                "attendance" -> AttendanceScreen(
                    state = attendanceState,
                    vm = attendanceViewModel,
                    onBack = { overlay = null }
                )

                "salary" -> SalaryScreen(
                    state = salaryState,
                    vm = salaryViewModel,
                    onBack = { overlay = null }
                )

                "score" -> ScoreScreen(
                    state = scoreState,
                    vm = scoreViewModel,
                    onBack = { overlay = null }
                )

                "reimburse" -> ReimburseScreen(
                    state = reimburseState,
                    vm = reimburseViewModel,
                    onBack = { overlay = null }
                )

                "contacts" -> ContactsScreen(
                    state = contactsState,
                    vm = contactsViewModel,
                    onBack = { overlay = null }
                )

                "agenda" -> AgendaScreen(
                    state = agendaState,
                    vm = agendaViewModel,
                    onBack = { overlay = null }
                )

                else -> saveableStateHolder.SaveableStateProvider(tab) {
                    when (tab) {
                        0 -> HomeScreen(
                            state = homeState,
                            onRefresh = { homeViewModel.load(refresh = true) },
                            onOpenSchedule = { tab = 2 },
                            onOpenProfile = { overlay = "profile" },
                            onOpenMessages = { overlay = "messages" },
                            onOpenFeature = { overlay = it },
                            unreadCount = messagesState.unreadBadge
                        )

                        1 -> TasksScreen(state = tasksState, vm = tasksViewModel)
                        2 -> ScheduleScreen(state = scheduleState, vm = scheduleViewModel)
                        else -> ExpiryScreen(
                            state = expiryState,
                            vm = expiryViewModel,
                            autoOpenScanner = autoOpenExpiryScanner,
                            onAutoOpenConsumed = { autoOpenExpiryScanner = false }
                        )
                    }
                }
            }
        }
    }
}

private enum class BottomTab(val label: String, val icon: ImageVector, val index: Int) {
    Home("首页", Icons.Outlined.Home, 0),
    Tasks("任务", Icons.Outlined.Assignment, 1),
    Schedule("排班", Icons.Outlined.CalendarMonth, 2),
    Expiry("效期", Icons.Outlined.Inventory2, 3)
}

private fun parseTaskRef(link: String, refId: String): String? {
    Regex("[?&]task=(\\d+)").find(link)?.groupValues?.getOrNull(1)?.let { return it }
    return refId.takeIf { it.isNotBlank() }
}

/* ---------------- 我的（首页头像进入） ---------------- */

@Composable
private fun ProfileScreen(
    userName: String,
    role: String,
    onBack: () -> Unit,
    onLogout: () -> Unit
) {
    val context = LocalContext.current
    var notifyEnabled by remember { mutableStateOf(NotifyPrefs.isEnabled()) }
    var dndEnabled by remember { mutableStateOf(NotifyPrefs.isDndEnabled()) }
    var showLogoutConfirm by remember { mutableStateOf(false) }
    var showAccountInfo by remember { mutableStateOf(false) }
    var showPassword by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onBack, modifier = Modifier.padding(end = 4.dp)) {
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    contentDescription = "返回",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
            Text("我的", style = MaterialTheme.typography.titleLarge)
        }

        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    userName.take(1),
                    color = MaterialTheme.colorScheme.primary,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text(userName, style = MaterialTheme.typography.titleLarge)
                Text(
                    roleLabel(role),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(Modifier.height(18.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                InfoRow("工号", SessionStore.empNo.ifBlank { "—" })
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow("岗位", SessionStore.position.ifBlank { "—" })
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                InfoRow("门店", SessionStore.storeName.ifBlank { "—" })
            }
        }

        Spacer(Modifier.height(16.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                EntryRow("账号资料", "手机号、工号与本次登录") { showAccountInfo = true }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.5.dp)
                EntryRow("修改密码", "6—20 位，需包含字母和数字") { showPassword = true }
            }
        }

        Spacer(Modifier.height(16.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("通知设置", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(10.dp))
                SwitchRow(
                    title = "接收通知",
                    subtitle = "任务、私信、审批、排班与公告",
                    checked = notifyEnabled,
                    onCheckedChange = {
                        notifyEnabled = it
                        NotifyPrefs.setEnabled(it)
                    }
                )
                SwitchRow(
                    title = "免打扰 22:00–08:00",
                    subtitle = "静默期内不弹出，解除后补发",
                    checked = dndEnabled,
                    onCheckedChange = {
                        dndEnabled = it
                        NotifyPrefs.setDndEnabled(it)
                    }
                )
            }
        }

        Spacer(Modifier.height(26.dp))
        OutlinedButton(
            onClick = { showLogoutConfirm = true },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
        ) {
            Text("退出登录")
        }
        Spacer(Modifier.height(28.dp))
    }

    if (showAccountInfo) {
        AlertDialog(
            onDismissRequest = { showAccountInfo = false },
            title = { Text("账号资料") },
            text = {
                Column {
                    InfoRow("姓名", userName)
                    InfoRow("手机号", SessionStore.phone.ifBlank { "—" })
                    InfoRow("飞书工号", SessionStore.empNo.ifBlank { "待审核" })
                    InfoRow("岗位", SessionStore.position.ifBlank { "—" })
                    InfoRow("门店", SessionStore.storeName.ifBlank { "—" })
                    InfoRow(
                        "本次登录",
                        SessionStore.lastLoginAt.takeIf { it.isNotBlank() }?.let { formatFullTime(it) } ?: "—"
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showAccountInfo = false }) { Text("关闭") }
            }
        )
    }

    if (showPassword) {
        PasswordDialog(
            onDismiss = { showPassword = false },
            onSuccess = {
                showPassword = false
                Toast.makeText(context, "密码已更新", Toast.LENGTH_SHORT).show()
            }
        )
    }

    if (showLogoutConfirm) {
        AlertDialog(
            onDismissRequest = { showLogoutConfirm = false },
            title = { Text("退出登录") },
            text = { Text("退出后需要重新输入手机号和密码，确定退出吗？") },
            confirmButton = {
                TextButton(onClick = {
                    showLogoutConfirm = false
                    onLogout()
                }) { Text("退出", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutConfirm = false }) { Text("取消") }
            }
        )
    }
}

@Composable
private fun EntryRow(title: String, subtitle: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            Text(
                subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Icon(
            Icons.AutoMirrored.Outlined.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun PasswordDialog(onDismiss: () -> Unit, onSuccess: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun validate(): String? {
        if (oldPassword.isBlank()) return "请输入原密码"
        if (newPassword.length !in 6..20 ||
            !newPassword.any { it.isLetter() } ||
            !newPassword.any { it.isDigit() }
        ) return "新密码需 6—20 位，且包含字母和数字"
        if (newPassword != confirmPassword) return "两次输入的新密码不一致"
        if (newPassword == oldPassword) return "新密码不能与原密码相同"
        return null
    }

    AlertDialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        title = { Text("修改密码") },
        text = {
            Column {
                OutlinedTextField(
                    value = oldPassword,
                    onValueChange = { oldPassword = it },
                    label = { Text("原密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("新密码") },
                    placeholder = { Text("6—20 位，包含字母和数字") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = confirmPassword,
                    onValueChange = { confirmPassword = it },
                    label = { Text("确认新密码") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth()
                )
                error?.let {
                    Spacer(Modifier.height(6.dp))
                    Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !submitting,
                onClick = {
                    val invalid = validate()
                    if (invalid != null) {
                        error = invalid
                        return@TextButton
                    }
                    error = null
                    submitting = true
                    scope.launch {
                        try {
                            AccountRepository.changePassword(oldPassword, newPassword, confirmPassword)
                            submitting = false
                            onSuccess()
                        } catch (e: Exception) {
                            submitting = false
                            error = when (e) {
                                is ApiException -> e.message?.ifBlank { "修改失败，请稍后重试" } ?: "修改失败，请稍后重试"
                                else -> e.message?.ifBlank { "网络异常，请稍后重试" } ?: "网络异常，请稍后重试"
                            }
                        }
                    }
                }
            ) { Text(if (submitting) "保存中…" else "保存") }
        },
        dismissButton = {
            TextButton(enabled = !submitting, onClick = onDismiss) { Text("取消") }
        }
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 9.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SwitchRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium)
            Text(
                subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

private fun roleLabel(role: String): String = when (role) {
    "super" -> "超级管理员"
    "admin" -> "管理员"
    "manager" -> "店长"
    "staff" -> "员工"
    else -> role.ifBlank { "员工" }
}

/** 账号资料里的登录时间：yyyy-MM-dd HH:mm。 */
private fun formatFullTime(raw: String): String {
    val m = Regex("(\\d{4})-(\\d{1,2})-(\\d{1,2})[ T](\\d{1,2}):(\\d{2})").find(raw) ?: return raw
    val g = m.groupValues
    return "%s-%02d-%02d %02d:%s".format(g[1], g[2].toInt(), g[3].toInt(), g[4].toInt(), g[5])
}
