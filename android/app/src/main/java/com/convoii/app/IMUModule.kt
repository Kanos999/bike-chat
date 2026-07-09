package com.convoii.app

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class IMUModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), SensorEventListener {

  override fun getName(): String = "IMUModule"

  private val sensorManager: SensorManager? =
    reactContext.getSystemService(android.content.Context.SENSOR_SERVICE) as? SensorManager
  private var accel: Sensor? = null
  private var gyro: Sensor? = null
  private var running = false

  private fun sendSample(accelX: Float, accelY: Float, accelZ: Float, gyroX: Float, gyroY: Float, gyroZ: Float, timestamp: Long) {
    val params: WritableMap = Arguments.createMap()
    val accelMap = Arguments.createMap()
    accelMap.putDouble("x", accelX.toDouble())
    accelMap.putDouble("y", accelY.toDouble())
    accelMap.putDouble("z", accelZ.toDouble())
    params.putMap("accel", accelMap)
    val gyroMap = Arguments.createMap()
    gyroMap.putDouble("x", gyroX.toDouble())
    gyroMap.putDouble("y", gyroY.toDouble())
    gyroMap.putDouble("z", gyroZ.toDouble())
    params.putMap("gyro", gyroMap)
    params.putDouble("timestamp", timestamp.toDouble())
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_IMU_SAMPLE, params)
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (!running) return
    when (event.sensor.type) {
      Sensor.TYPE_ACCELEROMETER -> {
        lastAccel = event.values
        lastAccelTime = event.timestamp
        maybeEmit()
      }
      Sensor.TYPE_GYROSCOPE -> {
        lastGyro = event.values
        lastGyroTime = event.timestamp
        maybeEmit()
      }
    }
  }

  private var lastAccel: FloatArray? = null
  private var lastGyro: FloatArray? = null
  private var lastAccelTime = 0L
  private var lastGyroTime = 0L

  private fun maybeEmit() {
    val a = lastAccel
    val g = lastGyro
    if (a != null && a.size >= 3 && g != null && g.size >= 3) {
      val ts = (lastAccelTime + lastGyroTime) / 2
      sendSample(a[0], a[1], a[2], g[0], g[1], g[2], ts)
    }
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  @ReactMethod
  fun startIMUTracking() {
    if (running || sensorManager == null) return
    accel = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    gyro = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    val delay = SensorManager.SENSOR_DELAY_GAME
    accel?.let { sensorManager.registerListener(this, it, delay) }
    gyro?.let { sensorManager.registerListener(this, it, delay) }
    running = true
  }

  @ReactMethod
  fun stopIMUTracking() {
    if (!running || sensorManager == null) return
    sensorManager.unregisterListener(this)
    running = false
    lastAccel = null
    lastGyro = null
  }

  @ReactMethod
  fun addListener(_eventName: String) {}

  @ReactMethod
  fun removeListeners(_count: Int) {}

  companion object {
    const val EVENT_IMU_SAMPLE = "IMUSample"
  }
}
