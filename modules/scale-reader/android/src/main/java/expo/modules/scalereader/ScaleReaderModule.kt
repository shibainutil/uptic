package expo.modules.scalereader

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Passive BLE scanner for broadcast-only bathroom scales (OKOK / Chipsea style).
 * These scales never accept a connection; each weigh-in is sent as manufacturer
 * data in the advertisement. We forward every manufacturer-data entry whose
 * company ID low byte is 0xC0 and leave decoding to JS so it can change via OTA.
 */
class ScaleReaderModule : Module() {
  private var scanner: BluetoothLeScanner? = null
  private var callback: ScanCallback? = null

  private val adapter: BluetoothAdapter?
    get() = (appContext.reactContext?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  override fun definition() = ModuleDefinition {
    Name("ScaleReader")

    Events("onAdvertisement", "onScanError")

    Function("isBluetoothOn") { adapter?.isEnabled == true }

    Function("start") { start() }

    Function("stop") { stop() }

    OnDestroy { stop() }
  }

  @SuppressLint("MissingPermission")
  private fun start() {
    if (callback != null) return
    val a = adapter ?: throw CodedException("ERR_NO_BLUETOOTH", "This device has no Bluetooth.", null)
    if (!a.isEnabled) throw CodedException("ERR_BLUETOOTH_OFF", "Bluetooth is turned off.", null)
    val s = a.bluetoothLeScanner ?: throw CodedException("ERR_BLUETOOTH_OFF", "Bluetooth is turned off.", null)

    val cb = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
      override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { handle(it) }
      override fun onScanFailed(errorCode: Int) {
        callback = null
        scanner = null
        sendEvent("onScanError", mapOf("code" to errorCode))
      }
    }
    val settings = ScanSettings.Builder()
      .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
      .build()
    try {
      s.startScan(null, settings, cb)
    } catch (e: SecurityException) {
      throw CodedException("ERR_PERMISSION", "Bluetooth permission not granted.", e)
    }
    scanner = s
    callback = cb
  }

  @SuppressLint("MissingPermission")
  private fun stop() {
    val cb = callback ?: return
    try {
      if (adapter?.isEnabled == true) scanner?.stopScan(cb)
    } catch (_: Exception) {
    }
    callback = null
    scanner = null
  }

  private fun handle(result: ScanResult) {
    val data = result.scanRecord?.manufacturerSpecificData ?: return
    for (i in 0 until data.size()) {
      val companyId = data.keyAt(i)
      if ((companyId and 0xFF) != 0xC0) continue
      val bytes = data.valueAt(i) ?: continue
      sendEvent(
        "onAdvertisement",
        mapOf(
          "address" to result.device.address,
          "rssi" to result.rssi,
          "companyId" to companyId,
          "data" to bytes.joinToString("") { "%02X".format(it) },
        )
      )
    }
  }
}
