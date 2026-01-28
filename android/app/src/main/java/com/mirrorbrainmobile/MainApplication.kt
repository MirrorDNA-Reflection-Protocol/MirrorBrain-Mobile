package com.mirrorbrainmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    
    // DISABLED: AgentService auto-start removed.
    // The dataSync foreground service type crashes after ~6 hours on Android 15
    // (ForegroundServiceDidNotStartInTimeException). All agent orchestration now
    // runs in JS via OrchestratorService. AgentService class retained for future
    // native agent work (e.g., background sync with WorkManager).
    //
    // try {
    //     val intent = android.content.Intent(this, com.mirrorbrainmobile.service.AgentService::class.java)
    //     if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
    //         startForegroundService(intent)
    //     } else {
    //         startService(intent)
    //     }
    // } catch (e: Exception) {
    //     android.util.Log.w("MainApplication", "AgentService start deferred: ${e.message}")
    // }
  }
}
