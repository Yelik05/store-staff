package com.tastien.storestaff.nativeapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/*
 * 设计令牌对齐网页端 assets/css/theme.css：
 * 浅色：背景 #F5F4F2、卡片 #FFFFFF、正文 #121212、辅助文字 #787878、分割线 #E5E3DF、品牌红 #E10600
 * 深色：背景 #0F0F0F、卡片 #181818、正文 #F2F1EF、辅助文字 #8C8A86、分割线 #2A2A2A、品牌红提亮 #FF6B5E
 * 字号：20/18/16/15/14/12/11；圆角：10/14/20
 */

private val BrandRed = Color(0xFFE10600)
private val BrandRedPressed = Color(0xFFB90500)
private val BrandRedSoft = Color(0xFFFDECEA)
private val BrandRedDark = Color(0xFFFF6B5E)

private val LightColors = lightColorScheme(
    primary = BrandRed,
    onPrimary = Color.White,
    primaryContainer = BrandRedSoft,
    onPrimaryContainer = Color(0xFF5C0400),
    secondary = BrandRedPressed,
    onSecondary = Color.White,
    secondaryContainer = BrandRedSoft,
    onSecondaryContainer = Color(0xFF5C0400),
    background = Color(0xFFF5F4F2),
    onBackground = Color(0xFF121212),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF121212),
    surfaceVariant = Color(0xFFFAF9F7),
    onSurfaceVariant = Color(0xFF787878),
    surfaceContainer = Color(0xFFFFFFFF),
    outline = Color(0xFFE5E3DF),
    outlineVariant = Color(0xFFEFEDEA),
    error = BrandRed,
    onError = Color.White
)

private val DarkColors = darkColorScheme(
    primary = BrandRedDark,
    onPrimary = Color(0xFF2B0000),
    primaryContainer = Color(0xFF3A1512),
    onPrimaryContainer = Color(0xFFFFDAD6),
    secondary = Color(0xFFFF8A7E),
    onSecondary = Color(0xFF2B0000),
    secondaryContainer = Color(0xFF3A1512),
    onSecondaryContainer = Color(0xFFFFDAD6),
    background = Color(0xFF0F0F0F),
    onBackground = Color(0xFFF2F1EF),
    surface = Color(0xFF181818),
    onSurface = Color(0xFFF2F1EF),
    surfaceVariant = Color(0xFF1F1F1F),
    onSurfaceVariant = Color(0xFF8C8A86),
    surfaceContainer = Color(0xFF181818),
    outline = Color(0xFF2A2A2A),
    outlineVariant = Color(0xFF242424),
    error = Color(0xFFFF6B5E),
    onError = Color(0xFF2B0000)
)

private val StoreTypography = Typography(
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, lineHeight = 32.sp),
    headlineSmall = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.SemiBold, lineHeight = 28.sp),
    titleLarge = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold, lineHeight = 26.sp),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp),
    bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 23.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 18.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.Medium),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium)
)

private val StoreShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(20.dp)
)

@Composable
fun StoreStaffTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = StoreTypography,
        shapes = StoreShapes,
        content = content
    )
}
