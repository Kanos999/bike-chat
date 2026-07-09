package com.convoii.app

import android.annotation.SuppressLint
import android.content.Context
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
private const val BIKE_CHAT_MANUFACTURER_ID = 0xFFFE
private const val MAX_RIDER_ID_BYTES = 20

@SuppressLint("MissingPermission")
class BleModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "BleModule"

  private val bluetoothManager: BluetoothManager? =
    reactContext.getSystemService(ReactApplicationContext.BLUETOOTH_SERVICE) as? BluetoothManager
  private val audioManager: AudioManager? =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
  private val bleAdvertiser: BluetoothLeAdvertiser? = bluetoothAdapter?.bluetoothLeAdvertiser
  private val bleScanner: BluetoothLeScanner? = bluetoothAdapter?.bluetoothLeScanner

  private var advertising = false
  private var scanning = false
  private var voiceRouteActive = false
  private var audioDeviceCallbackRegistered = false
  private var currentRiderId: String = ""
  private var currentFlags: Int = 0
  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      updateAudioState()
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      updateAudioState()
    }
  }

  private fun registerAudioDeviceCallbackIfNeeded() {
    if (audioDeviceCallbackRegistered) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        audioManager?.registerAudioDeviceCallback(audioDeviceCallback, null)
        audioDeviceCallbackRegistered = true
      } catch (_: Exception) {
      }
    }
  }

  private fun unregisterAudioDeviceCallbackIfNeeded() {
    if (!audioDeviceCallbackRegistered) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        audioManager?.unregisterAudioDeviceCallback(audioDeviceCallback)
      } catch (_: Exception) {
      }
    }
    audioDeviceCallbackRegistered = false
  }

  private fun emitBeacon(riderId: String, rssi: Int, flags: Int) {
    val params: WritableMap = Arguments.createMap()
    params.putString("riderId", riderId)
    params.putInt("rssi", rssi)
    params.putInt("flags", flags)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_BEACON, params)
  }

  private fun emitHeadsetEvent(eventType: String) {
    val params: WritableMap = Arguments.createMap()
    params.putString("event", eventType)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_HEADSET, params)
  }

  private fun emitHelmetConnection(connected: Boolean) {
    val params: WritableMap = Arguments.createMap()
    params.putBoolean("connected", connected)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_HELMET, params)
  }

  private fun emitAudioRoute(route: String) {
    val params: WritableMap = Arguments.createMap()
    params.putString("route", route)
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_AUDIO_ROUTE, params)
  }

  private fun hasAudioDevice(types: Set<Int>): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    val devices = audioManager?.getDevices(AudioManager.GET_DEVICES_ALL) ?: return false
    return devices.any { device -> types.contains(device.type) }
  }

  private fun isBluetoothVoiceAvailable(): Boolean {
    val bluetoothTypes = mutableSetOf(
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      bluetoothTypes.add(AudioDeviceInfo.TYPE_BLE_HEADSET)
      bluetoothTypes.add(AudioDeviceInfo.TYPE_BLE_SPEAKER)
    }
    return hasAudioDevice(bluetoothTypes)
  }

  private fun isWiredAudioAvailable(): Boolean {
    return hasAudioDevice(setOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET))
  }

  private fun currentAudioRoute(): String {
    val manager = audioManager ?: return "UNKNOWN"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val device = manager.communicationDevice
      if (device != null) {
        return when (device.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "BT_INTERCOM"
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_USB_HEADSET -> "WIRED_HEADSET"
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "EARPIECE"
          AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "SPEAKER"
          AudioDeviceInfo.TYPE_BLE_HEADSET,
          AudioDeviceInfo.TYPE_BLE_SPEAKER -> "BT_INTERCOM"
          else -> "UNKNOWN"
        }
      }
    }

    return when {
      manager.isBluetoothScoOn || isBluetoothVoiceAvailable() -> "BT_INTERCOM"
      manager.isSpeakerphoneOn -> "SPEAKER"
      isWiredAudioAvailable() -> "WIRED_HEADSET"
      else -> "EARPIECE"
    }
  }

  private fun updateAudioState() {
    val bluetoothConnected = isBluetoothVoiceAvailable()
    emitHelmetConnection(bluetoothConnected)
    emitAudioRoute(currentAudioRoute())
  }

  @ReactMethod
  fun startAdvertising(riderId: String, flags: Int) {
    if (bleAdvertiser == null || bluetoothAdapter?.isEnabled != true) return
    currentRiderId = riderId
    currentFlags = flags
    val riderBytes = riderId.encodeToByteArray()
    val truncated = if (riderBytes.size > MAX_RIDER_ID_BYTES) riderBytes.copyOf(MAX_RIDER_ID_BYTES) else riderBytes
    val data = byteArrayOf(flags.toByte()) + truncated
    val advertiseData = AdvertiseData.Builder()
      .addManufacturerData(BIKE_CHAT_MANUFACTURER_ID, data)
      .build()
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .setConnectable(false)
      .build()
    try {
      bleAdvertiser.startAdvertising(settings, advertiseData, advertiseCallback)
      advertising = true
    } catch (e: Exception) {
      // permission or unsupported
    }
  }

  @ReactMethod
  fun stopAdvertising() {
    if (!advertising || bleAdvertiser == null) return
    try {
      bleAdvertiser.stopAdvertising(advertiseCallback)
    } catch (e: Exception) { }
    advertising = false
  }

  @ReactMethod
  fun startScanning() {
    if (bleScanner == null || bluetoothAdapter?.isEnabled != true || scanning) return
    scanning = true
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()
    try {
      bleScanner.startScan(emptyList(), settings, scanCallback)
    } catch (e: Exception) {
      scanning = false
    }
  }

  @ReactMethod
  fun stopScanning() {
    if (!scanning || bleScanner == null) return
    try {
      bleScanner.stopScan(scanCallback)
    } catch (e: Exception) { }
    scanning = false
  }

  @ReactMethod
  fun addListener(_eventName: String) {}

  @ReactMethod
  fun removeListeners(_count: Int) {}

  @ReactMethod
  fun startVoiceRoute() {
    val manager = audioManager ?: return
    voiceRouteActive = true
    registerAudioDeviceCallbackIfNeeded()
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    manager.isSpeakerphoneOn = false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val target = manager.availableCommunicationDevices.firstOrNull { device ->
        when (device.type) {
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
          AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
          AudioDeviceInfo.TYPE_BLE_HEADSET,
          AudioDeviceInfo.TYPE_BLE_SPEAKER,
          AudioDeviceInfo.TYPE_WIRED_HEADSET,
          AudioDeviceInfo.TYPE_USB_HEADSET,
          AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> true
          else -> false
        }
      }
      if (target != null) {
        manager.setCommunicationDevice(target)
      }
    } else if (isBluetoothVoiceAvailable()) {
      try {
        manager.startBluetoothSco()
        manager.isBluetoothScoOn = true
      } catch (_: Exception) {
      }
    }

    updateAudioState()
  }

  @ReactMethod
  fun stopVoiceRoute() {
    val manager = audioManager ?: return
    voiceRouteActive = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      manager.clearCommunicationDevice()
    }
    try {
      manager.stopBluetoothSco()
    } catch (_: Exception) {
    }
    manager.isBluetoothScoOn = false
    manager.mode = AudioManager.MODE_NORMAL
    unregisterAudioDeviceCallbackIfNeeded()
    updateAudioState()
  }

  @ReactMethod
  fun getCurrentAudioRoute(promise: Promise) {
    promise.resolve(currentAudioRoute())
  }

  // Rider joined the channel → the rising chime. `kind` is accepted for API parity
  // with the JS JoinAlert but the single clip is played for every non-"off" style.
  @ReactMethod
  fun playJoinTone(kind: String) = playTone(R.raw.chime)

  // Rider left the channel → the descending disconnect chime (a reversed, pitched-
  // down variant of the join chime).
  @ReactMethod
  fun playLeaveTone(kind: String) = playTone(R.raw.disconnect)

  // Plays a bundled clip with VOICE_COMMUNICATION usage so it rides the same route
  // and volume as the intercom itself — into the helmet over SCO when connected, or
  // the earpiece/speaker the call is already using — tied to the *call* volume, not
  // the (often ducked) media stream. Best-effort: any failure is swallowed.
  private fun playTone(resId: Int) {
    try {
      val player = android.media.MediaPlayer()
      player.setAudioAttributes(
        android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      val afd = reactApplicationContext.resources.openRawResourceFd(resId)
      player.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
      afd.close()
      player.setVolume(1f, 1f) // max, relative to the voice-call stream
      // Release the player once the clip finishes so it isn't leaked.
      player.setOnCompletionListener { it.release() }
      player.setOnErrorListener { mp, _, _ -> mp.release(); true }
      player.prepare()
      player.start()
    } catch (_: Exception) {
      // best-effort alert
    }
  }

  private val advertiseCallback = object : android.bluetooth.le.AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {}
    override fun onStartFailure(errorCode: Int) {}
  }

  private val scanCallback = object : android.bluetooth.le.ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult?) {
      if (result == null) return
      val record = result.scanRecord ?: return
      val mfg = record.getManufacturerSpecificData(BIKE_CHAT_MANUFACTURER_ID) ?: return
      if (mfg.size < 1) return
      val flags = mfg[0].toInt() and 0xFF
      val riderId = if (mfg.size > 1) String(mfg.copyOfRange(1, mfg.size), Charsets.UTF_8).trim('\u0000') else "unknown"
      if (riderId.isNotEmpty()) {
        emitBeacon(riderId, result.rssi, flags)
      }
    }
  }

  companion object {
    const val EVENT_BEACON = "BleBeacon"
    const val EVENT_HEADSET = "BleHeadsetEvent"
    const val EVENT_HELMET = "BleHelmetConnection"
    const val EVENT_AUDIO_ROUTE = "BleAudioRoute"
  }
}
