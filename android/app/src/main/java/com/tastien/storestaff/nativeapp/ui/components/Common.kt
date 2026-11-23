package com.tastien.storestaff.nativeapp.ui.components

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tastien.storestaff.nativeapp.core.AppConfig
import com.tastien.storestaff.nativeapp.ui.theme.rememberSemanticColors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/* ---------------- 通用格式化 ---------------- */

/** 附件 key → 可访问地址；demo/ 为演示占位，不展示。 */
fun fileUrl(key: String): String? {
    val k = key.trim()
    if (k.isEmpty()) return null
    if (k.startsWith("http://") || k.startsWith("https://")) return k
    if (k.startsWith("demo/")) return null
    if (k.startsWith("uploads/")) return AppConfig.BASE_URL + k
    return AppConfig.BASE_URL + "uploads/" + k.trimStart('/')
}

/** 截止时间：2026-11-23 18:00:00 → 11-23 18:00。 */
fun formatDeadline(raw: String): String {
    val s = raw.trim().removePrefix("截止").trim()
    val m = Regex("(\\d{4})-(\\d{1,2})-(\\d{1,2})[ T](\\d{1,2}):(\\d{2})").find(s) ?: return s.ifBlank { "—" }
    val month = m.groupValues[2].toInt()
    val day = m.groupValues[3].toInt()
    val hour = m.groupValues[4].toInt()
    return "%02d-%02d %02d:%s".format(month, day, hour, m.groupValues[5])
}

/** ISO 时间：今天只显示时分，昨天显示「昨天 HH:mm」，其余 MM-dd HH:mm。 */
fun formatTime(raw: String): String {
    if (raw.isBlank()) return ""
    val value = raw.replace(' ', 'T')
    val date = value.take(10)
    val time = value.substringAfter('T', "").take(5)
    val today = LocalDate.now().toString()
    val yesterday = LocalDate.now().minusDays(1).toString()
    return when {
        date == today -> time
        date == yesterday -> "昨天 $time"
        date.length >= 10 -> date.substring(5) + " " + time
        else -> value
    }
}

fun formatExecDate(date: String): String =
    if (date.length >= 10) date.substring(5) else date

/* ---------------- 状态徽章 ---------------- */

enum class BadgeKind { Ok, Warn, Info, Bad, Neutral }

@Composable
fun StatusBadge(text: String, kind: BadgeKind, modifier: Modifier = Modifier) {
    val colors = rememberSemanticColors()
    val (fg, bg) = when (kind) {
        BadgeKind.Ok -> colors.ok to colors.okTint
        BadgeKind.Warn -> colors.warn to colors.warnTint
        BadgeKind.Info -> colors.info to colors.infoTint
        BadgeKind.Bad -> colors.bad to colors.badTint
        BadgeKind.Neutral -> colors.neutral to colors.neutralTint
    }
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = bg,
        contentColor = fg
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall
        )
    }
}

/* ---------------- 空态 / 错误态 / 分页 ---------------- */

@Composable
fun EmptyState(title: String, hint: String = "") {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 56.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        if (hint.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(
                hint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Text(
                "加载失败",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(Modifier.height(6.dp))
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            Spacer(Modifier.height(4.dp))
            TextButton(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
fun LoadMoreRow(remaining: Int, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center
    ) {
        TextButton(onClick = onClick) {
            Text("加载更多（剩余 $remaining 项）")
        }
    }
}

/* ---------------- 图片加载（OkHttp + 内存缓存，不引入新依赖） ---------------- */

private val imageClient: OkHttpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .build()

private val imageCache = object : LruCache<String, Bitmap>(32 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
}

private fun decodeSampled(bytes: ByteArray, maxDim: Int = 768): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxDim && bounds.outHeight / (sample * 2) >= maxDim) {
        sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
}

@Composable
fun RemoteImage(
    key: String,
    modifier: Modifier = Modifier,
    corner: Dp = 6.dp,
    contentScale: ContentScale = ContentScale.Crop,
    onClick: (() -> Unit)? = null
) {
    val url = fileUrl(key)
    var bitmap by remember(url) { mutableStateOf(url?.let { imageCache.get(it) }) }
    var failed by remember(url) { mutableStateOf(url == null) }

    LaunchedEffect(url) {
        if (url == null || bitmap != null) return@LaunchedEffect
        val loaded = withContext(Dispatchers.IO) {
            runCatching {
                imageClient.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    if (!response.isSuccessful) null
                    else response.body?.bytes()?.let { decodeSampled(it) }
                }
            }.getOrNull()
        }
        if (loaded != null) {
            imageCache.put(url, loaded)
            bitmap = loaded
        } else {
            failed = true
        }
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(corner))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        contentAlignment = Alignment.Center
    ) {
        val bmp = bitmap
        when {
            bmp != null -> Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = contentScale
            )

            failed -> Text(
                "图片",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            else -> CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
fun LocalImage(uri: Uri, modifier: Modifier = Modifier, corner: Dp = 6.dp) {
    val context = LocalContext.current
    var bitmap by remember(uri) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(uri) {
        bitmap = withContext(Dispatchers.IO) {
            runCatching {
                context.contentResolver.openInputStream(uri)?.use { it.readBytes() }?.let { decodeSampled(it, 384) }
            }.getOrNull()
        }
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(corner))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center
    ) {
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        } else {
            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp)
        }
    }
}

/** 分隔小圆点。 */
@Composable
fun Dot(color: Color, size: Dp = 6.dp) {
    Box(modifier = Modifier.size(size).background(color, RoundedCornerShape(50)))
}
