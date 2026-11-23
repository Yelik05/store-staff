package com.tastien.storestaff.nativeapp.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.tastien.storestaff.nativeapp.MainActivity
import com.tastien.storestaff.nativeapp.R

/** 通知渠道与本地通知展示 */
object NotificationHelper {
    const val CHANNEL_TASKS = "tasks"
    const val CHANNEL_MESSAGES = "messages"
    const val CHANNEL_SHIFT = "shift"
    const val CHANNEL_SYSTEM = "system"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            Triple(CHANNEL_TASKS, "任务提醒", NotificationManager.IMPORTANCE_HIGH),
            Triple(CHANNEL_MESSAGES, "消息与审批", NotificationManager.IMPORTANCE_HIGH),
            Triple(CHANNEL_SHIFT, "今日排班", NotificationManager.IMPORTANCE_DEFAULT),
            Triple(CHANNEL_SYSTEM, "系统与生日关怀", NotificationManager.IMPORTANCE_DEFAULT)
        )
        for ((id, name, importance) in channels) {
            val channel = NotificationChannel(id, name, importance).apply {
                description = "塔斯汀门店助手通知"
                enableVibration(importance >= NotificationManager.IMPORTANCE_HIGH)
            }
            manager.createNotificationChannel(channel)
        }
    }

    fun show(context: Context, event: NotifyEvent) {
        if (!NotifyPrefs.isEnabled()) return
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return

        val channel = when (event.category) {
            "task" -> CHANNEL_TASKS
            "message", "approval" -> CHANNEL_MESSAGES
            "shift" -> CHANNEL_SHIFT
            else -> CHANNEL_SYSTEM
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_CLEAR_TOP or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_ROUTE, event.route)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            event.id.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val highPriority = event.category == "task" || event.category == "message" || event.category == "approval"
        val builder = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher_monochrome)
            .setContentTitle(event.title)
            .setContentText(event.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(event.body))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(if (highPriority) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setGroup("store_staff")

        try {
            manager.notify(event.id.hashCode(), builder.build())
        } catch (e: SecurityException) {
            /* Android 13 未授权通知权限时忽略 */
        }
    }
}
