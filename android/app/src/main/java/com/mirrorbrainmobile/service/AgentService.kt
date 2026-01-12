package com.mirrorbrainmobile.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.mirrorbrainmobile.R
import com.mirrorbrainmobile.grpc.AgentBridgeGrpc
import com.mirrorbrainmobile.grpc.PingRequest
import io.grpc.ManagedChannel
import io.grpc.ManagedChannelBuilder

class AgentService : Service() {

    private var channel: ManagedChannel? = null
    private var stub: AgentBridgeGrpc.AgentBridgeStub? = null
    private val TAG = "AgentService"

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "AgentService Created - Improving System Intelligence")
        createNotificationChannel()
        startForeground(1, createNotification())
        
        // Initialize gRPC in a background thread
        Thread {
            connectToBrain()
        }.start()
    }

    private fun connectToBrain() {
        try {
            Log.d(TAG, "Attempting to connect to Brain at localhost:50051")
            
            // NOTE: On Android Emulator use 10.0.2.2, but for local Termux on device use localhost
            // We assume Termux/Python is running on the SAME device interface.
            channel = ManagedChannelBuilder.forAddress("localhost", 50051)
                .usePlaintext()
                .build()

            stub = AgentBridgeGrpc.newStub(channel)
            
            // Initial Ping
            val request = PingRequest.newBuilder()
                .setTimestamp(System.currentTimeMillis())
                .build()

            Log.d(TAG, "Sending Ping...")
            // We need a blocking stub for this simple check or use async callback
            val blockingStub = AgentBridgeGrpc.newBlockingStub(channel)
            val response = blockingStub.ping(request)
            
            Log.d(TAG, "Brain Connected! Response Time: ${response.timestamp}")

        } catch (e: Exception) {
            Log.e(TAG, "Failed to connect to Brain: ${e.message}")
            e.printStackTrace()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        channel?.shutdown()
        Log.d(TAG, "AgentService Destroyed")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val serviceChannel = NotificationChannel(
                "AgentServiceChannel",
                "MirrorBrain Core",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(serviceChannel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, "AgentServiceChannel")
            .setContentTitle("MirrorBrain Active")
            .setContentText("Neural Link Established")
            .setSmallIcon(R.mipmap.ic_launcher)
            .build()
    }
}
