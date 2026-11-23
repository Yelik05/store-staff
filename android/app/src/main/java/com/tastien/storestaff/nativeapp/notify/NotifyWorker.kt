package com.tastien.storestaff.nativeapp.notify

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.tastien.storestaff.nativeapp.core.ApiException
import com.tastien.storestaff.nativeapp.core.SessionExpiredException
import com.tastien.storestaff.nativeapp.core.SessionStore
import java.util.concurrent.TimeUnit

/** 后台兜底轮询：30 分钟一次，仅在联网时执行；被系统延迟属正常。 */
class NotifyWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        if (!SessionStore.hasToken) return Result.success()
        return try {
            NotifyRepository.poll(applicationContext)
            Result.success()
        } catch (e: SessionExpiredException) {
            Result.success()
        } catch (e: ApiException) {
            if (e.code == "NETWORK_ERROR") Result.retry() else Result.success()
        } catch (e: Exception) {
            Result.success()
        }
    }

    companion object {
        private const val UNIQUE_NAME = "store_staff_notify_poll"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<NotifyWorker>(30, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
