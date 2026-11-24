package expo.modules.garminsteps

import android.content.Context
import android.util.Log
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import org.json.JSONObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** One day's totals from the watch's own counter. */
data class DayTotal(val date: String, val steps: Long, val metres: Long, val kcal: Long)

/**
 * Receives step totals from the "Uptic Steps" Connect IQ watch app.
 *
 * Started from Application.onCreate (see GarminStepsPackage), and registers Uptic with
 * Garmin Connect for the watch app's messages. Garmin Connect then sends each message as a
 * broadcast addressed to Uptic, which GarminMessageReceiver (declared in the manifest)
 * receives even while the app is closed. Each message is stored, written to Health Connect
 * right away, and passed on to JS (which writes Firestore) if the app is running.
 *
 * Garmin's binder-service delivery (registerAppToUseBinderService) did not deliver
 * anything for this sideloaded watch app with Garmin Connect 5.31, so it isn't used.
 */
object GarminStepsReceiver {
  const val TAG = "GarminSteps"
  /** id from watch/manifest.xml, written the way Garmin Connect reports it: no dashes. */
  const val WATCH_APP_ID = "4d17fd8c3a73480598db555f74118319"

  private var ciq: ConnectIQ? = null
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  @Volatile var ready = false; private set
  @Volatile var error: String? = null; private set

  /** Set while JS is listening. */
  @Volatile var onDays: ((List<DayTotal>) -> Unit)? = null

  @Synchronized
  fun start(context: Context) {
    if (ciq != null) return
    val app = context.applicationContext
    val c = ConnectIQ.getInstance(app, ConnectIQ.IQConnectType.WIRELESS)
    ciq = c
    c.initialize(app, false, object : ConnectIQ.ConnectIQListener {
      override fun onSdkReady() {
        ready = true
        error = null
        register(app, c)
      }

      override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus) {
        Log.w(TAG, "Connect IQ init failed: $status")
        error = status.name
        ready = false
        synchronized(this@GarminStepsReceiver) { ciq = null }
      }

      override fun onSdkShutDown() {
        ready = false
      }
    })
  }

  private fun register(app: Context, c: ConnectIQ) {
    Log.i(TAG, "Connect IQ SDK ready")
    // A binder-service registration (made by an earlier test build) stops Garmin Connect from
    // broadcasting. Undo it once; that also shuts the SDK down, so start it again after.
    val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("binderCleared", false)) {
      prefs.edit().putBoolean("binderCleared", true).commit()
      try {
        c.unregisterAppFromUsingBinderService(WATCH_APP_ID, app)
        Log.i(TAG, "Cleared binder-service registration; restarting SDK")
      } catch (e: Exception) {
        Log.w(TAG, "Clearing binder registration failed", e)
      }
      synchronized(this) { ciq = null }
      ready = false
      start(app)
      return
    }

    // While Uptic runs, the SDK's own receiver delivers here too.
    val listener = ConnectIQ.IQApplicationEventListener { _, _, data, status ->
      if (status == ConnectIQ.IQMessageStatus.SUCCESS) handleMessage(app, data) {}
    }
    try {
      val devices = c.knownDevices ?: emptyList()
      devices.forEach { d -> c.registerForAppEvents(d, IQApp(WATCH_APP_ID), listener) }
      Log.i(TAG, "Registered for watch messages on ${devices.size} device(s)")
    } catch (e: Exception) {
      error = e.message
      Log.w(TAG, "Registering for watch messages failed", e)
    }
  }

  /** Write every stored day to Health Connect again, then call [done]. */
  fun rewriteHealth(context: Context, done: () -> Unit) {
    val app = context.applicationContext
    scope.launch {
      HealthWriter.write(app, StepStore.days(app), force = true)
      done()
    }
  }

  /** Store a watch message, write it to Health Connect, tell JS; then call [done]. */
  fun handleMessage(context: Context, data: List<Any?>, done: () -> Unit) {
    val app = context.applicationContext
    val days = parse(data)
    if (days.isEmpty()) { done(); return }
    StepStore.save(app, days)
    onDays?.invoke(days)
    scope.launch {
      try { HealthWriter.write(app, StepStore.days(app)) } finally { done() }
    }
  }

  private const val PREFS = "uptic_garmin_steps"

  /** { "v": 1, "days": [ { "d": "YYYY-MM-DD", "s": steps, "m": metres, "c": kcal } ] } */
  private fun parse(data: List<Any?>): List<DayTotal> {
    val msg = data.firstOrNull() as? Map<*, *> ?: return emptyList()
    val list = msg["days"] as? List<*> ?: return emptyList()
    return list.mapNotNull { item ->
      val m = item as? Map<*, *> ?: return@mapNotNull null
      val date = m["d"] as? String ?: return@mapNotNull null
      if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(date)) return@mapNotNull null
      DayTotal(
        date,
        (m["s"] as? Number)?.toLong() ?: 0,
        (m["m"] as? Number)?.toLong() ?: 0,
        (m["c"] as? Number)?.toLong() ?: 0,
      )
    }
  }
}

/** Latest totals per day, kept on the phone (also while the app is closed). */
object StepStore {
  private const val PREFS = "uptic_garmin_steps"
  private const val KEEP_DAYS = 60

  @Synchronized
  fun save(context: Context, days: List<DayTotal>) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val all = JSONObject(prefs.getString("days", "{}") ?: "{}")
    val now = System.currentTimeMillis()
    for (d in days) {
      all.put(d.date, JSONObject().put("s", d.steps).put("m", d.metres).put("c", d.kcal).put("at", now))
    }
    // Forget old days.
    val keys = all.keys().asSequence().sorted().toList()
    keys.dropLast(KEEP_DAYS).forEach { all.remove(it) }
    prefs.edit().putString("days", all.toString()).putLong("lastAt", now).apply()
  }

  fun json(context: Context): String =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("days", "{}") ?: "{}"

  fun lastAt(context: Context): Long =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong("lastAt", 0)

  fun days(context: Context): List<DayTotal> {
    val all = JSONObject(json(context))
    return all.keys().asSequence().map { k ->
      val o = all.getJSONObject(k)
      DayTotal(k, o.optLong("s"), o.optLong("m"), o.optLong("c"))
    }.toList()
  }
}
