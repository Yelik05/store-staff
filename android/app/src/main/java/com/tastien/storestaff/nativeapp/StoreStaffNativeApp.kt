package com.tastien.storestaff.nativeapp

import android.app.Application
import com.tastien.storestaff.nativeapp.core.SessionStore
import com.tastien.storestaff.nativeapp.notify.NotificationHelper
import com.tastien.storestaff.nativeapp.notify.NotifyPrefs
import com.tastien.storestaff.nativeapp.notify.NotifyWorker

class StoreStaffNativeApp : Application() {
    override fun onCreate() {
        super.onCreate()
        SessionStore.init(this)
        NotifyPrefs.init(this)
        NotificationHelper.ensureChannels(this)
        NotifyWorker.schedule(this)
    }
}
