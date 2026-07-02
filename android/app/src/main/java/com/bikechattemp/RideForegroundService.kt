package com.bikechattemp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the app process (and therefore the React Native JS
 * thread, GPS, BLE, presence WebSocket and WebRTC audio) alive while a ride is
 * active and the app is backgrounded or the screen is off.
 *
 * The service does no work itself; its job is to (a) hold the process up so the
 * existing native modules keep running and (b) declare the foreground service
 * types that Android 10+ requires for background location/microphone access.
 *
 * Started/stopped from JS via [RideServiceModule]. Calling startForegroundService
 * again (RideService.refresh) re-runs onStartCommand so the service can widen its
 * foregroundServiceType once a permission such as RECORD_AUDIO is granted.
 */
class RideForegroundService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createChannel()
    val notification = buildNotification()
    val type = foregroundType()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && type != 0) {
        startForeground(NOTIF_ID, notification, type)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (e: Exception) {
      // The requested type may be rejected (e.g. microphone type without RECORD_AUDIO
      // on Android 14). Fall back to a plain foreground service so the ride still
      // survives backgrounding; type-gated features simply won't run in background.
      try {
        startForeground(NOTIF_ID, notification)
      } catch (_: Exception) {
        stopSelf()
        return START_NOT_STICKY
      }
    }
    // Recreate if the OS kills us while a ride is still active.
    return START_STICKY
  }

  /** Build the foreground service type bitmask from permissions granted right now. */
  private fun foregroundType(): Int {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
    var type = 0
    if (hasPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ||
      hasPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
    ) {
      type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
      if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
        type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
    }
    return type
  }

  private fun hasPermission(perm: String): Boolean =
    checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED

  private fun createChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Ride mode",
          NotificationManager.IMPORTANCE_LOW
        )
        channel.description = "Keeps your ride intercom and location active"
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
      }
    }
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent: PendingIntent? = launchIntent?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Bike Chat — ride active")
      .setContentText("Location and intercom running")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(contentIntent)
      .build()
  }

  companion object {
    const val CHANNEL_ID = "bike_chat_ride"
    const val NOTIF_ID = 4711
  }
}
