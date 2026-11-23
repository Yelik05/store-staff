package com.tastien.storestaff.nativeapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/**
 * 语义色与网页端 theme.css 保持一致：
 * 浅色 ok #1E7A4C / warn #8E6209 / info #2F5F8A / bad #B3261E；
 * 深色 ok #6FBF8E / warn #D9A44B / info #8AB4D8 / bad #F07B70。
 */
@Immutable
data class SemanticColors(
    val ok: Color,
    val okTint: Color,
    val warn: Color,
    val warnTint: Color,
    val info: Color,
    val infoTint: Color,
    val bad: Color,
    val badTint: Color,
    val neutral: Color,
    val neutralTint: Color
)

@Composable
fun rememberSemanticColors(): SemanticColors {
    return if (isSystemInDarkTheme()) {
        SemanticColors(
            ok = Color(0xFF6FBF8E),
            okTint = Color(0x1F6FBF8E),
            warn = Color(0xFFD9A44B),
            warnTint = Color(0x1FD9A44B),
            info = Color(0xFF8AB4D8),
            infoTint = Color(0x1F8AB4D8),
            bad = Color(0xFFF07B70),
            badTint = Color(0x1FF07B70),
            neutral = Color(0xFF8C8A86),
            neutralTint = Color(0xFF232322)
        )
    } else {
        SemanticColors(
            ok = Color(0xFF1E7A4C),
            okTint = Color(0xFFE7F2EB),
            warn = Color(0xFF8E6209),
            warnTint = Color(0xFFF6EEDD),
            info = Color(0xFF2F5F8A),
            infoTint = Color(0xFFE8EEF4),
            bad = Color(0xFFB3261E),
            badTint = Color(0xFFF8E7E5),
            neutral = Color(0xFF787878),
            neutralTint = Color(0xFFF0EEE9)
        )
    }
}
