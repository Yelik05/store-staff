package com.tastien.storestaff.nativeapp.ui.expiry

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.net.Uri
import android.os.Build
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FlashOff
import androidx.compose.material.icons.outlined.FlashOn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.tastien.storestaff.nativeapp.data.ExpiryMaterial
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * 效期扫码录入：CameraX 取景 + ML Kit 条码识别。
 *
 * 关键管线参数（真机排障要点）：
 * - ImageAnalysis 目标分辨率 1280×720（FALLBACK 取最近更高档），避免默认 640×480 下二维码模块过小；
 * - STRATEGY_KEEP_ONLY_LATEST + 180ms 节流，避免队列堆积；
 * - InputImage 旋转角取自 ImageProxy.imageInfo.rotationDegrees，竖屏 90° 由 ML Kit 处理；
 * - 中心连续自动对焦 + 轻触对焦 + 补光灯；
 * - 连续 8 秒未命中自动轮换：全幅 → 中心裁剪 70%×放大 → 裁剪 50%×放大 → 裁剪 70%+灰度增强。
 */
@Composable
fun ExpiryScannerDialog(
    materials: List<ExpiryMaterial>,
    closeTime: String,
    pending: PendingScan?,
    pendingSave: MaterialSaveUi?,
    onOffer: (QrResult) -> Unit,
    onSelectMaterial: (String) -> Unit,
    onTimeChange: (String) -> Unit,
    onConfirmPending: () -> Unit,
    onClearPending: () -> Unit,
    onRetryPending: () -> Unit,
    onManualSave: (ExpiryMaterial, String) -> Unit,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted = it }

    LaunchedEffect(Unit) {
        if (!granted) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val runtime = remember { ScanRuntime() }
    var hint by remember { mutableStateOf("将效期标签二维码放入取景框") }
    var lastText by remember { mutableStateOf("") }
    var lastAt by remember { mutableLongStateOf(0L) }
    var showManual by remember { mutableStateOf(false) }
    var debug by remember { mutableStateOf(ScanDebug()) }
    var galleryBusy by remember { mutableStateOf(false) }

    val pendingNow by rememberUpdatedState(pending)

    val galleryScanner = remember { BarcodeScanning.getClient(allFormatsOptions()) }
    DisposableEffect(Unit) {
        onDispose { galleryScanner.close() }
    }

    LaunchedEffect(Unit) {
        while (true) {
            delay(400)
            debug = ScanDebug(
                frame = if (runtime.frameWidth > 0) "${runtime.frameWidth}×${runtime.frameHeight}" else "—",
                rotation = runtime.rotation,
                attempts = runtime.attempts.get(),
                strategy = strategyLabel(runtime.strategy),
                reason = runtime.lastReason,
                misses = runtime.misses
            )
            if (pendingNow == null && runtime.misses >= 10 && !hint.contains("靠近")) {
                hint = "未识别到二维码，请靠近一点或换个角度"
            }
        }
    }

    fun handleDecoded(text: String) {
        val now = System.currentTimeMillis()
        if (text == lastText && now - lastAt < 2500) return
        lastText = text
        lastAt = now
        runtime.misses = 0
        runtime.lastReason = "已识别条码"
        onOffer(parseQrText(text))
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        galleryBusy = true
        hint = "正在识别相册图片…"
        scope.launch {
            val bitmap = withContext(Dispatchers.IO) { decodeGalleryBitmap(context, uri) }
            if (bitmap == null) {
                galleryBusy = false
                runtime.lastReason = "相册图片读取失败"
                hint = "图片读取失败，请换一张图片"
                return@launch
            }
            val codes = runCatching {
                scanBitmap(galleryScanner, bitmap)
            }.getOrElse {
                runtime.lastReason = "相册识别异常：${it.message ?: "未知"}"
                emptyList()
            }
            galleryBusy = false
            val text = codes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
            if (text != null) {
                handleDecoded(text)
            } else {
                runtime.lastReason = "相册图片未检测到条码"
                hint = "相册图片未识别到条码，请换一张更清晰、正对标签的照片"
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("扫一扫录入到期时间", style = MaterialTheme.typography.titleLarge)
                        Text(
                            if (showManual) "手动输入物料与到期时间"
                            else "连续扫描；识别结果固定在下方，完整匹配自动保存",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Outlined.Close, contentDescription = "关闭")
                    }
                }

                if (showManual) {
                    ManualEntryPanel(
                        materials = materials,
                        closeDueOf = { material -> material.closeDue },
                        defaultTime = closeTime,
                        onSave = { material, dueText ->
                            onDismiss()
                            onManualSave(material, dueText)
                        },
                        onBack = {
                            showManual = false
                            hint = "将效期标签二维码放入取景框"
                        }
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 16.dp)
                            .padding(top = 16.dp)
                            .fillMaxWidth()
                            .aspectRatio(3f / 4f)
                            .clip(RoundedCornerShape(18.dp))
                            .background(Color.Black),
                        contentAlignment = Alignment.Center
                    ) {
                        when {
                            !granted -> Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(
                                        "未授予相机权限",
                                        color = Color.White,
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                    Spacer(Modifier.height(6.dp))
                                    Text(
                                        "授权后即可摄像头识别效期标签",
                                        color = Color.White.copy(alpha = 0.7f),
                                        style = MaterialTheme.typography.bodySmall
                                    )
                                    Spacer(Modifier.height(10.dp))
                                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                                        Text("重新授权")
                                    }
                                }
                            }

                            else -> CameraPreview(
                                paused = false,
                                runtime = runtime,
                                onDecoded = { handleDecoded(it) }
                            )
                        }
                    }

                    Text(
                        hint,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    /* 真机排障：帧尺寸 / 旋转角 / 尝试次数 / 当前策略 / 最近失败原因 */
                    Text(
                        "帧 ${debug.frame} · 旋转 ${debug.rotation}° · 尝试 ${debug.attempts} 次\n" +
                            "策略 ${debug.strategy} · ${debug.reason}",
                        modifier = Modifier.padding(horizontal = 16.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(
                            onClick = { galleryLauncher.launch("image/*") },
                            enabled = !galleryBusy
                        ) { Text("从相册选图") }
                        TextButton(onClick = { showManual = true }) { Text("手动输入") }
                        if (galleryBusy) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                        }
                    }

                    val current = pending
                    if (current != null) {
                        PendingPanel(
                            pending = current,
                            materials = materials,
                            saveUi = pendingSave,
                            onSelect = onSelectMaterial,
                            onTimeChange = onTimeChange,
                            onRetry = onRetryPending
                        )
                    }

                    Spacer(Modifier.weight(1f))

                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        if (current != null) {
                            TextButton(
                                onClick = onClearPending,
                                modifier = Modifier.weight(1f)
                            ) { Text("清除结果") }
                            val selected = materials.firstOrNull { it.id == current.materialId }
                            val canConfirm = selected != null && current.date.isNotBlank() &&
                                (selected.closeDue || current.time.length == 5)
                            Button(
                                onClick = onConfirmPending,
                                modifier = Modifier.weight(1f),
                                enabled = !current.saved && canConfirm
                            ) {
                                Text(
                                    when {
                                        current.saved -> "已保存"
                                        current.scrapNeeded -> "确认已报废"
                                        else -> "保存"
                                    }
                                )
                            }
                        } else {
                            Button(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("关闭") }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- 识别结果面板（固定展示，不自动消失） ---------------- */

@Composable
private fun PendingPanel(
    pending: PendingScan,
    materials: List<ExpiryMaterial>,
    saveUi: MaterialSaveUi?,
    onSelect: (String) -> Unit,
    onTimeChange: (String) -> Unit,
    onRetry: () -> Unit
) {
    val colors = rememberSemanticColors()
    val selected = materials.firstOrNull { it.id == pending.materialId }
    val closeDue = selected?.closeDue == true

    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text("识别结果", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(4.dp))
        if (pending.name.isNotBlank()) {
            Text(
                "标签物料：${pending.name}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        if (!pending.saved) {
            Spacer(Modifier.height(6.dp))
            Text(
                if (pending.materialId.isBlank()) "请选择要登记的原物料" else "选择原物料（已自动匹配）",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(4.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(materials, key = { it.id }) { material ->
                    FilterChip(
                        selected = material.id == pending.materialId,
                        onClick = { onSelect(material.id) },
                        label = { Text(material.name) }
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            when {
                pending.date.isBlank() -> "未识别到到期日期，请对准标签重试或改用手动输入"
                pending.timeError.isNotBlank() -> "到期时间无法识别（${pending.timeError}），请手动补充"
                closeDue -> "到期：${pending.date}（门店打烊时刻）"
                else -> "到期：${pending.date} ${pending.time.ifBlank { "（需补充时间）" }}"
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        if (!closeDue && !pending.saved) {
            Spacer(Modifier.height(6.dp))
            OutlinedTextField(
                value = pending.time,
                onValueChange = onTimeChange,
                label = { Text("到期时间（HH:mm）") },
                placeholder = { Text("例如 18:30") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
            )
        }
        if (pending.scrapNeeded && !pending.saved) {
            Spacer(Modifier.height(4.dp))
            Text(
                "到期时间已过，保存将按「已报废」登记，需再次确认",
                style = MaterialTheme.typography.labelSmall,
                color = colors.bad
            )
        }
        if (pending.saved || saveUi?.status == SaveStatus.Saving) {
            Spacer(Modifier.height(4.dp))
            Text(
                "已保存：到期 ${pending.dueText}（同一物料当天重复扫描按覆盖处理）",
                style = MaterialTheme.typography.labelSmall,
                color = colors.ok
            )
        }
        if (saveUi?.status == SaveStatus.Failed) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "保存失败：${saveUi.message}",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.labelSmall,
                    color = colors.bad
                )
                TextButton(onClick = onRetry) { Text("重试保存") }
            }
        }
    }
}

/* ---------------- 手动输入 ---------------- */

@Composable
private fun ManualEntryPanel(
    materials: List<ExpiryMaterial>,
    closeDueOf: (ExpiryMaterial) -> Boolean,
    defaultTime: String,
    onSave: (ExpiryMaterial, String) -> Unit,
    onBack: () -> Unit
) {
    var selectedId by remember { mutableStateOf(materials.firstOrNull()?.id.orEmpty()) }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var time by remember { mutableStateOf("22:00") }
    var errorText by remember { mutableStateOf<String?>(null) }
    val selected = materials.firstOrNull { it.id == selectedId }
    val closeDue = selected != null && closeDueOf(selected)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp)
    ) {
        Text("选择原物料", style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(6.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(materials, key = { it.id }) { material ->
                FilterChip(
                    selected = material.id == selectedId,
                    onClick = { selectedId = material.id },
                    label = { Text(material.name) }
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = date,
            onValueChange = { date = it.take(10) },
            label = { Text("到期日期") },
            placeholder = { Text("yyyy-MM-dd") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        if (!closeDue) {
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = time,
                onValueChange = { time = it.take(5) },
                label = { Text("到期时间") },
                placeholder = { Text("HH:mm") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )
        } else {
            Spacer(Modifier.height(6.dp))
            Text(
                "该物料为打烊到期，时间按门店打烊 $defaultTime 保存",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        errorText?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("返回扫码") }
            Button(
                modifier = Modifier.weight(1f),
                onClick = {
                    val m = selected
                    if (m == null) {
                        errorText = "请选择原物料"
                        return@Button
                    }
                    val d = runCatching { LocalDate.parse(date) }.getOrNull()
                    if (d == null) {
                        errorText = "日期格式应为 yyyy-MM-dd"
                        return@Button
                    }
                    if (m.closeDue) {
                        errorText = null
                        onSave(m, d.toString())
                    } else {
                        val parts = time.split(':')
                        val hour = parts.getOrNull(0)?.toIntOrNull()
                        val minute = parts.getOrNull(1)?.toIntOrNull()
                        if (parts.size != 2 || hour == null || minute == null ||
                            hour !in 0..23 || minute !in 0..59
                        ) {
                            errorText = "时间格式应为 HH:mm"
                            return@Button
                        }
                        errorText = null
                        onSave(m, "$d " + "%02d:%02d".format(hour, minute))
                    }
                }
            ) { Text("保存并填入") }
        }
    }
}

/* ---------------- 相机取景与识别 ---------------- */

@Composable
private fun CameraPreview(paused: Boolean, runtime: ScanRuntime, onDecoded: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient(allFormatsOptions()) }
    val pausedState = rememberUpdatedState(paused)
    val decodedState = rememberUpdatedState(onDecoded)
    var error by remember { mutableStateOf<String?>(null) }
    var binding by remember { mutableStateOf(true) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchOn by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        onDispose {
            executor.shutdown()
            scanner.close()
        }
    }

    LaunchedEffect(Unit) {
        try {
            val provider = ProcessCameraProvider.getInstance(context).awaitCamera()
            val resolution = ResolutionSelector.Builder()
                .setResolutionStrategy(
                    ResolutionStrategy(
                        Size(1280, 720),
                        ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
                    )
                )
                .build()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(resolution)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                .build()

            var lastProcessed = 0L
            /* 效期标签通常较小，默认先走中心裁剪放大，8 秒后再轮换其他策略 */
            var strategy = 1
            runtime.strategy = strategy
            var framesSinceSwitch = 0

            analysis.setAnalyzer(executor) { proxy ->
                var handedOff = false
                try {
                    if (pausedState.value) return@setAnalyzer
                    val now = System.currentTimeMillis()
                    if (now - lastProcessed < 180) return@setAnalyzer
                    lastProcessed = now

                    runtime.frameWidth = proxy.width
                    runtime.frameHeight = proxy.height
                    runtime.rotation = proxy.imageInfo.rotationDegrees
                    runtime.attempts.incrementAndGet()

                    /* 约 44 帧（≈8 秒）切换一次裁剪/增强策略 */
                    framesSinceSwitch++
                    if (framesSinceSwitch >= 44) {
                        framesSinceSwitch = 0
                        strategy = (strategy + 1) % 4
                        runtime.strategy = strategy
                        android.util.Log.i("ExpiryScan", "strategy -> $strategy")
                    }

                    if (strategy == 0) {
                        val media = proxy.image
                        if (media == null) {
                            registerMiss(runtime, "无图像数据")
                            return@setAnalyzer
                        }
                        val input = InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees)
                        handedOff = true
                        scanner.process(input)
                            .addOnSuccessListener { codes ->
                                val raw = codes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
                                if (raw != null) {
                                    android.util.Log.i("ExpiryScan", "decoded full-frame: $raw")
                                    runtime.misses = 0
                                    runtime.lastReason = "已识别条码"
                                    decodedState.value(raw)
                                } else {
                                    registerMiss(runtime, "未检测到条码")
                                }
                            }
                            .addOnFailureListener { registerMiss(runtime, "识别异常：${it.message ?: "未知"}") }
                            .addOnCompleteListener { proxy.close() }
                    } else {
                        val bitmap = runCatching { proxy.toBitmapCompat() }.getOrNull()
                        if (bitmap == null) {
                            registerMiss(runtime, "YUV 转换失败")
                            return@setAnalyzer
                        }
                        val upright = runCatching {
                            rotateBitmap(bitmap, proxy.imageInfo.rotationDegrees)
                        }.getOrDefault(bitmap)
                        val prepared = prepareStrategy(upright, strategy)
                        handedOff = true
                        scanner.process(InputImage.fromBitmap(prepared, 0))
                            .addOnSuccessListener { codes ->
                                val raw = codes.firstOrNull { !it.rawValue.isNullOrBlank() }?.rawValue
                                if (raw != null) {
                                    android.util.Log.i("ExpiryScan", "decoded crop($strategy): $raw")
                                    runtime.misses = 0
                                    runtime.lastReason = "已识别条码（${strategyLabel(strategy)}）"
                                    decodedState.value(raw)
                                } else {
                                    registerMiss(runtime, "未检测到条码")
                                }
                            }
                            .addOnFailureListener { registerMiss(runtime, "识别异常：${it.message ?: "未知"}") }
                            .addOnCompleteListener { proxy.close() }
                    }
                } finally {
                    if (!handedOff) proxy.close()
                }
            }

            provider.unbindAll()
            camera = provider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis
            )
            binding = false
        } catch (e: Exception) {
            error = e.message ?: "摄像头启动失败"
            binding = false
        }
    }

    /* 中心连续对焦：近距离模糊时也能持续尝试合焦 */
    LaunchedEffect(camera) {
        val cam = camera ?: return@LaunchedEffect
        while (true) {
            runCatching {
                cam.cameraControl.startFocusAndMetering(
                    FocusMeteringAction.Builder(
                        previewView.meteringPointFactory.createPoint(0.5f, 0.5f, 1f),
                        FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
                    ).setAutoCancelDuration(2, TimeUnit.SECONDS).build()
                )
            }
            delay(2000)
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { previewView },
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectTapGestures { offset ->
                        val cam = camera ?: return@detectTapGestures
                        val point = previewView.meteringPointFactory.createPoint(offset.x, offset.y)
                        runCatching {
                            cam.cameraControl.startFocusAndMetering(
                                FocusMeteringAction.Builder(
                                    point,
                                    FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
                                ).setAutoCancelDuration(3, TimeUnit.SECONDS).build()
                            )
                        }
                    }
                }
        )
        if (binding) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
        }
        error?.let {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("摄像头不可用", color = Color.White, fontWeight = FontWeight.Medium)
                Spacer(Modifier.height(6.dp))
                Text(
                    "$it；可返回列表手动填写到期时间",
                    color = Color.White.copy(alpha = 0.75f),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        IconButton(
            onClick = {
                torchOn = !torchOn
                camera?.cameraControl?.enableTorch(torchOn)
            },
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(8.dp)
                .background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(50))
        ) {
            Icon(
                if (torchOn) Icons.Outlined.FlashOn else Icons.Outlined.FlashOff,
                contentDescription = "补光灯",
                tint = Color.White
            )
        }
    }
}

/* ---------------- 扫码运行时与图像处理 ---------------- */

internal class ScanRuntime {
    @Volatile var frameWidth = 0
    @Volatile var frameHeight = 0
    @Volatile var rotation = 0
    @Volatile var strategy = 0
    @Volatile var misses = 0
    @Volatile var lastReason = "等待画面"
    val attempts = AtomicInteger(0)
}

private data class ScanDebug(
    val frame: String = "—",
    val rotation: Int = 0,
    val attempts: Int = 0,
    val strategy: String = "全幅",
    val reason: String = "等待画面",
    val misses: Int = 0
)

private fun strategyLabel(strategy: Int): String = when (strategy) {
    1 -> "裁剪70%×2"
    2 -> "裁剪50%×3"
    3 -> "裁剪70%+增强"
    else -> "全幅"
}

private fun allFormatsOptions(): BarcodeScannerOptions =
    BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
        .build()

private fun registerMiss(runtime: ScanRuntime, reason: String) {
    runtime.misses += 1
    runtime.lastReason = reason
}

/** YUV_420_888 → Bitmap（camera-core 1.4 无 ImageProxy.toBitmap，自行转换）。 */
private fun ImageProxy.toBitmapCompat(): Bitmap {
    val yPlane = planes[0]
    val uPlane = planes[1]
    val vPlane = planes[2]
    val yBuf = yPlane.buffer
    val uBuf = uPlane.buffer
    val vBuf = vPlane.buffer
    val width = width
    val height = height
    val ySize = width * height
    val nv21 = ByteArray(ySize + ySize / 2)

    var pos = 0
    for (row in 0 until height) {
        yBuf.position(row * yPlane.rowStride)
        val len = minOf(width, yBuf.remaining())
        yBuf.get(nv21, pos, len)
        pos += width
    }

    pos = ySize
    val chromaHeight = height / 2
    val chromaWidth = width / 2
    for (row in 0 until chromaHeight) {
        for (col in 0 until chromaWidth) {
            val vIndex = row * vPlane.rowStride + col * vPlane.pixelStride
            val uIndex = row * uPlane.rowStride + col * uPlane.pixelStride
            nv21[pos++] = vBuf.get(vIndex)
            nv21[pos++] = uBuf.get(uIndex)
        }
    }

    val yuv = YuvImage(nv21, ImageFormat.NV21, width, height, null)
    val out = ByteArrayOutputStream()
    yuv.compressToJpeg(Rect(0, 0, width, height), 90, out)
    val bytes = out.toByteArray()
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: throw IllegalStateException("JPEG 解码失败")
}

private fun rotateBitmap(source: Bitmap, degrees: Int): Bitmap {
    if (degrees % 360 == 0) return source
    val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
    return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
}

/** 中心裁剪 + 放大；strategy=3 叠加灰度对比增强。 */
private fun prepareStrategy(source: Bitmap, strategy: Int): Bitmap {
    val ratio = when (strategy) {
        2 -> 0.5f
        1, 3 -> 0.7f
        else -> 1f
    }
    val cropW = (source.width * ratio).toInt().coerceAtLeast(64)
    val cropH = (source.height * ratio).toInt().coerceAtLeast(64)
    val x = (source.width - cropW) / 2
    val y = (source.height - cropH) / 2
    val crop = if (ratio >= 1f) source else Bitmap.createBitmap(source, x, y, cropW, cropH)

    val target = 1000f
    val factor = maxOf(target / crop.width, target / crop.height).coerceIn(1f, 4f)
    val scaled = if (factor > 1.15f) {
        Bitmap.createScaledBitmap(
            crop,
            (crop.width * factor).toInt(),
            (crop.height * factor).toInt(),
            true
        )
    } else {
        crop
    }
    return if (strategy == 3) enhanceContrast(scaled) else scaled
}

/** 灰度 + 5% 分位拉伸 + 轻阈值，提升低对比标签。 */
private fun enhanceContrast(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    val pixels = IntArray(w * h)
    src.getPixels(pixels, 0, w, 0, 0, w, h)
    val hist = IntArray(256)
    val luma = IntArray(pixels.size)
    for (i in pixels.indices) {
        val p = pixels[i]
        val v = ((p shr 16 and 0xFF) * 299 + (p shr 8 and 0xFF) * 587 + (p and 0xFF) * 114) / 1000
        luma[i] = v
        hist[v]++
    }
    val total = pixels.size
    var low = 0
    var cum = 0
    while (low < 255 && cum < total * 0.05) {
        cum += hist[low]
        low++
    }
    var high = 255
    cum = 0
    while (high > 0 && cum < total * 0.05) {
        cum += hist[high]
        high--
    }
    if (high <= low) return src
    val out = IntArray(pixels.size)
    for (i in pixels.indices) {
        var nv = (luma[i] - low) * 255 / (high - low)
        nv = when {
            nv < 40 -> 0
            nv > 215 -> 255
            else -> nv
        }
        out[i] = (0xFF shl 24) or (nv shl 16) or (nv shl 8) or nv
    }
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    bmp.setPixels(out, 0, w, 0, 0, w, h)
    return bmp
}

/* ---------------- 相册图片识别 ---------------- */

private fun decodeGalleryBitmap(context: Context, uri: Uri): Bitmap? = runCatching {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val source = ImageDecoder.createSource(context.contentResolver, uri)
        ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
            val w = info.size.width
            val h = info.size.height
            val scale = minOf(1f, 1600f / maxOf(w, h))
            if (scale < 1f) {
                decoder.setTargetSize((w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1))
            }
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        context.contentResolver.openInputStream(uri)?.use { input ->
            val bytes = input.readBytes()
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            var sample = 1
            while (bounds.outWidth / (sample * 2) > 1600 || bounds.outHeight / (sample * 2) > 1600) {
                sample *= 2
            }
            BitmapFactory.decodeByteArray(
                bytes,
                0,
                bytes.size,
                BitmapFactory.Options().apply { inSampleSize = sample }
            )
        }
    }
}.getOrNull()

private suspend fun scanBitmap(scanner: BarcodeScanner, bitmap: Bitmap): List<Barcode> =
    suspendCancellableCoroutine { cont ->
        scanner.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { cont.resume(it) }
            .addOnFailureListener { cont.resumeWithException(it) }
    }

/* ---------------- CameraX 异步工具 ---------------- */

private val directExecutor = java.util.concurrent.Executor { it.run() }

private suspend fun <T> com.google.common.util.concurrent.ListenableFuture<T>.awaitCamera(): T =
    suspendCancellableCoroutine { cont ->
        addListener(
            {
                try {
                    cont.resume(get())
                } catch (e: Exception) {
                    cont.resumeWithException(e)
                }
            },
            directExecutor
        )
    }
