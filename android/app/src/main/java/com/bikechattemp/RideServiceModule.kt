package com.bikechattemp

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** JS bridge to start/stop the ride foreground service ([RideForegroundService]). */
class RideServiceModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RideService"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val intent = Intent(ctx, RideForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ctx.startForegroundService(intent)
      } else {
        ctx.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RIDE_SERVICE_START_FAILED", e)
    }
  }

  /**
   * Re-issue the foreground service so it can widen its foregroundServiceType once a
   * new permission (e.g. RECORD_AUDIO from the voice channel) has been granted.
   */
  @ReactMethod
  fun refresh(promise: Promise) {
    start(promise)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      ctx.stopService(Intent(ctx, RideForegroundService::class.java))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("RIDE_SERVICE_STOP_FAILED", e)
    }
  }
}
