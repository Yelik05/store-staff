package com.tastien.storestaff.nativeapp

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import com.tastien.storestaff.nativeapp.ui.AppRoot
import com.tastien.storestaff.nativeapp.ui.theme.StoreStaffTheme

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_ROUTE = "openRoute"
    }

    private var openRoute by mutableStateOf<String?>(null)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* 拒绝也不影响使用 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        openRoute = intent?.getStringExtra(EXTRA_ROUTE)
        enableEdgeToEdge()
        setContent {
            StoreStaffTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    AppRoot(initialRoute = openRoute)
                }
            }
        }
        requestNotificationPermission()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        openRoute = intent.getStringExtra(EXTRA_ROUTE)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
