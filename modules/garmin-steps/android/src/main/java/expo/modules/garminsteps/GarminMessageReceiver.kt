package expo.modules.garminsteps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.garmin.android.connectiq.IQApp
import com.garmin.monkeybrains.serialization.MonkeyType
import com.garmin.monkeybrains.serialization.Serializer

/**
 * Declared in the manifest, so Android starts Uptic's process for a watch message even
 * while the app is closed. Garmin Connect sends each message as an INCOMING_MESSAGE
 * broadcast addressed to Uptic; this decodes it the same way the SDK does.
 * (While the app runs, the SDK's own receiver gets the same message; handling it twice
 * is harmless because the totals simply overwrite.)
 */
class GarminMessageReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    @Suppress("DEPRECATION")
    val app = intent.getParcelableExtra<IQApp>(EXTRA_APP)
    if (app?.applicationId?.equals(GarminStepsReceiver.WATCH_APP_ID, ignoreCase = true) != true) return
    val bytes = intent.getByteArrayExtra(EXTRA_PAYLOAD) ?: return
    val pending = goAsync()
    try {
      val data = Serializer.deserialize(bytes).map { toJava(it) }
      Log.i(GarminStepsReceiver.TAG, "Broadcast message from watch (${data.size} items)")
      GarminStepsReceiver.handleMessage(context.applicationContext, data) { pending.finish() }
    } catch (e: Exception) {
      Log.w(GarminStepsReceiver.TAG, "Could not decode watch message", e)
      pending.finish()
    }
  }

  private fun toJava(v: Any?): Any? = when (v) {
    is MonkeyType<*> -> toJava(v.toJava())
    is Map<*, *> -> v.entries.associate { toJava(it.key) to toJava(it.value) }
    is List<*> -> v.map { toJava(it) }
    else -> v
  }

  companion object {
    const val ACTION = "com.garmin.android.connectiq.INCOMING_MESSAGE"
    const val EXTRA_APP = "com.garmin.android.connectiq.EXTRA_REMOTE_APPLICATION"
    const val EXTRA_PAYLOAD = "com.garmin.android.connectiq.EXTRA_PAYLOAD"
  }
}
