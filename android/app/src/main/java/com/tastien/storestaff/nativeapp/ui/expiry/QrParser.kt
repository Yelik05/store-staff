package com.tastien.storestaff.nativeapp.ui.expiry

import com.tastien.storestaff.nativeapp.data.ExpiryMaterial
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * 效期标签二维码解析：与网页版 expiry.js 的 parseQrResult / normExpiry / fuzzyMatchMaterial 保持一致。
 * 支持 JSON、URL 查询参数、key:value 文本、纯日期时间文本与 10/13 位时间戳。
 */
data class QrResult(
    val raw: String,
    val name: String = "",
    val date: String = "",
    val time: String = "",
    val timeError: String = "",
    val missingTime: Boolean = false
) {
    val hasDue: Boolean get() = date.isNotBlank()
}

private val NAME_KEYS = listOf(
    "boomname", "productname", "materialname", "itemname", "name",
    "品名", "名称", "原物料", "产品名称"
)
private val TIME_KEYS = listOf(
    "expirationtime", "expirytime", "expiretime", "expiration", "expire", "exp",
    "validuntil", "validtime", "到期时间", "保质期至", "有效期至", "效期"
)

fun parseQrText(text: String): QrResult {
    val raw = text.trim()
    if (raw.isEmpty()) return QrResult(raw = text)

    val pairs = parsePairs(raw)
    val name = pickField(pairs, NAME_KEYS)
    val timeRaw = pickField(pairs, TIME_KEYS)
    if (name.isNotBlank() || timeRaw.isNotBlank()) {
        val info = if (timeRaw.isNotBlank()) normExpiry(timeRaw) else null
        return QrResult(
            raw = raw,
            name = name,
            date = info?.first.orEmpty(),
            time = info?.second.orEmpty(),
            timeError = info?.third.orEmpty(),
            missingTime = timeRaw.isBlank()
        )
    }

    val normalized = raw
        .replace('：', ':')
        .replace('／', '/')
        .map { ch -> if (ch in '０'..'９') '0' + (ch - '０') else ch }
        .joinToString("")

    val withTime = Regex("(20\\d{2})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?[ T]*(\\d{1,2}):(\\d{2})")
        .findAll(normalized)
        .lastOrNull()
    if (withTime != null) {
        val g = withTime.groupValues
        return QrResult(
            raw = raw,
            date = "%s-%02d-%02d".format(g[1], g[2].toInt(), g[3].toInt()),
            time = "%02d:%s".format(g[4].toInt(), g[5])
        )
    }

    val dateOnly = Regex("(20\\d{2})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?")
        .findAll(normalized)
        .lastOrNull()
    if (dateOnly != null) {
        val g = dateOnly.groupValues
        return QrResult(
            raw = raw,
            date = "%s-%02d-%02d".format(g[1], g[2].toInt(), g[3].toInt())
        )
    }

    return QrResult(raw = raw)
}

/** 物料名归一化：去空格、去括号规格后缀、忽略大小写。 */
fun normalizeMaterialName(value: String): String = value
    .replace(Regex("[\\s\u3000]"), "")
    .replace(Regex("[（(\\[【][^）)\\]】]*[）)\\]】]"), "")
    .lowercase()

fun matchMaterial(name: String, materials: List<ExpiryMaterial>): ExpiryMaterial? {
    val key = normalizeMaterialName(name)
    if (key.isEmpty()) return null
    materials.firstOrNull { normalizeMaterialName(it.name) == key }?.let { return it }
    var best: ExpiryMaterial? = null
    var bestLen = 0
    materials.forEach { material ->
        val candidate = normalizeMaterialName(material.name)
        if (candidate.isEmpty()) return@forEach
        if (key.contains(candidate) || candidate.contains(key)) {
            val len = minOf(candidate.length, key.length)
            if (len > bestLen) {
                best = material
                bestLen = len
            }
        }
    }
    return best
}

/** 到期文本解析：支持 yyyy-MM-dd、yyyy-MM-dd HH:mm、ISO 片段；打烊到期按 closeTime 补齐。 */
fun parseDueAt(text: String, closeTime: String = "23:00"): LocalDateTime? {
    val m = Regex("(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[ T](\\d{1,2}):(\\d{2}))?").find(text) ?: return null
    val g = m.groupValues
    return runCatching {
        val date = java.time.LocalDate.of(g[1].toInt(), g[2].toInt(), g[3].toInt())
        if (g[4].isBlank()) {
            date.atTime(closeTime.substringBefore(':').toIntOrNull() ?: 23, closeTime.substringAfter(':').toIntOrNull() ?: 0)
        } else {
            date.atTime(g[4].toInt(), g[5].toInt())
        }
    }.getOrNull()
}

/** 生成展示用到期文本，与网页一致：打烊到期 yyyy-MM-dd；其余 yyyy-MM-dd HH:mm。 */
fun formatDueValue(date: String, time: String, closeDue: Boolean): String =
    if (closeDue) date else if (time.isBlank()) date else "$date $time"

private fun parsePairs(text: String): Map<String, String> {
    val normalized = text.trim().removePrefix("?").removePrefix("&")

    if (normalized.startsWith("{") && normalized.endsWith("}")) {
        val obj = runCatching { kotlinx.serialization.json.Json.parseToJsonElement(normalized) as? kotlinx.serialization.json.JsonObject }
            .getOrNull()
        if (obj != null) {
            return obj.entries
                .filter { (_, v) -> v is kotlinx.serialization.json.JsonPrimitive }
                .associate { (k, v) -> k to (v as kotlinx.serialization.json.JsonPrimitive).content }
        }
    }

    var query = normalized
    val qIndex = query.indexOf('?')
    if (qIndex >= 0) query = query.substring(qIndex + 1)
    val fromUrl = linkedMapOf<String, String>()
    if (normalized.startsWith("http://", true) || normalized.startsWith("https://", true) || query.contains('=')) {
        query.split('&', ';').forEach { segment ->
            val i = segment.indexOf('=')
            if (i > 0) {
                val k = segment.substring(0, i).trim()
                val v = runCatching {
                    java.net.URLDecoder.decode(segment.substring(i + 1).replace("+", " "), "UTF-8")
                }.getOrDefault(segment.substring(i + 1).trim())
                if (k.isNotEmpty()) fromUrl[k] = v
            }
        }
        if (fromUrl.isNotEmpty()) return fromUrl
    }

    val pairs = linkedMapOf<String, String>()
    Regex("([A-Za-z_][A-Za-z0-9_]*|[\\u4e00-\\u9fa5]{2,8})\\s*[:=]\\s*([^,;&|\\r\\n]+)")
        .findAll(normalized)
        .forEach { m ->
            val k = m.groupValues[1].trim()
            val v = m.groupValues[2].trim()
            if (k.isNotEmpty() && v.isNotEmpty()) pairs[k] = v
        }
    return pairs
}

private fun pickField(pairs: Map<String, String>, keys: List<String>): String {
    if (pairs.isEmpty()) return ""
    val lower = pairs.entries.associate { it.key.lowercase() to it.value }
    keys.forEach { key ->
        lower[key]?.takeIf { it.isNotBlank() }?.let { return it }
    }
    return ""
}

/** 返回 Triple(date, time, error)。支持 8 位日期、10/13 位时间戳（北京时间）与常见日期格式。 */
private fun normExpiry(raw: String): Triple<String, String, String> {
    val value = raw.trim()
    if (value.isEmpty()) return Triple("", "", "空值")
    if (value.all { it.isDigit() }) {
        if (value.length == 10) {
            return stamp(value.toLong() * 1000, value)
        }
        if (value.length == 13) {
            return stamp(value.toLong(), value)
        }
        if (value.length == 8) {
            val mm = value.substring(4, 6).toIntOrNull() ?: 0
            val dd = value.substring(6, 8).toIntOrNull() ?: 0
            return if (mm in 1..12 && dd in 1..31) {
                Triple("${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}", "", "")
            } else {
                Triple("", "", "8 位数字不是有效日期")
            }
        }
        return Triple("", "", "${value.length} 位数字，位数异常")
    }
    val m = Regex("(20\\d{2})[-/.年](\\d{1,2})[-/.月](\\d{1,2})日?(?:[ T]*(\\d{1,2})[:：](\\d{2}))?")
        .find(value)
    if (m != null) {
        val g = m.groupValues
        val time = if (g[4].isNotBlank()) "%02d:%s".format(g[4].toInt(), g[5]) else ""
        return Triple("%s-%02d-%02d".format(g[1], g[2].toInt(), g[3].toInt()), time, "")
    }
    return Triple("", "", "无法识别的日期格式")
}

private fun stamp(ms: Long, raw: String): Triple<String, String, String> {
    val dt = LocalDateTime.ofInstant(Instant.ofEpochMilli(ms), ZoneOffset.ofHours(8))
    if (dt.year < 2000 || dt.year > 2100) return Triple("", "", "时间戳超出合理范围")
    return Triple(dt.format(DateTimeFormatter.ISO_LOCAL_DATE), dt.format(DateTimeFormatter.ofPattern("HH:mm")), "")
}
