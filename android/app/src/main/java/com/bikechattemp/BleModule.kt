package com.bikechattemp

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import com.facebook.react.bridge.Arguments
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
  private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
  private val bleAdvertiser: BluetoothLeAdvertiser? = bluetoothAdapter?.bluetoothLeAdvertiser
  private val bleScanner: BluetoothLeScanner? = bluetoothAdapter?.bluetoothLeScanner

  private var advertising = false
  private var scanning = false
  private var currentRiderId: String = ""
  private var currentFlags: Int = 0

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

  private val advertiseCallback = object : android.bluetooth.le.AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {}
    override fun onStartFailure(errorCode: Int) {}
  }

  private val scanCallback = object : android.bluetooth.le.ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult?) {
      if (result == null) return
      val record = result.scanRecord ?: return
      val mfgData = record.getManufacturerSpecificData() ?: return
      val mfg = mfgData.get(BIKE_CHAT_MANUFACTURER_ID) ?: return
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
  }
}
