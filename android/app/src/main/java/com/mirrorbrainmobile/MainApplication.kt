package com.mirrorbrainmobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.mirrorbrainmobile.passive.PassiveIntelligencePackage
import com.mirrorbrainmobile.root.RootDaemonPackage
import com.mirrorbrainmobile.root.RootShellManager
import com.mirrorbrainmobile.gesture.GesturePackage
import com.mirrorbrainmobile.overlay.OverlayPackage
import com.mirrorbrainmobile.widget.WidgetPackage
import com.mirrorbrainmobile.capture.CapturePackage
import com.mirrorbrainmobile.automation.AutomationPackage
import com.mirrorbrainmobile.location.LocationPackage
import com.mirrorbrainmobile.focus.FocusPackage
import com.mirrorbrainmobile.speech.SpeechPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // PassiveIntelligence: Clipboard watcher, notification interceptor, screen context
          add(PassiveIntelligencePackage())
          // RootDaemon: Root shell access and background daemon
          add(RootDaemonPackage())
          // GestureDetector: Shake and gesture detection
          add(GesturePackage())
          // OverlayService: Floating bubble and panel
          add(OverlayPackage())
          // Widget: Home screen widget
          add(WidgetPackage())
          // Capture: OCR and screenshot observation
          add(CapturePackage())
          // Automation: Cross-app accessibility actions
          add(AutomationPackage())
          // Location: Geofencing and location triggers
          add(LocationPackage())
          // Focus: Focus mode and auto-responder
          add(FocusPackage())
          // Speech: Native speech recognition
          add(SpeechPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)

    // Initialize root shell manager early
    RootShellManager.initialize()

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
