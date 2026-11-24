package expo.modules.habitalarms

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import org.json.JSONObject

const val TAG = "HabitAlarms"

/**
 * One habit notification: shown at [at] (epoch ms). Notifications with the same [tag] (a
 * habit session) replace each other, so a session's "Overdue" takes the place of its "Due".
 */
data class AlarmItem(
  val id: String,
  val tag: String,
  val at: Long,
  val title: String,
  val body: String,
  val url: String?,
  val data: String,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("tag", tag).put("at", at).put("title", title).put("body", body)
    .put("url", url ?: JSONObject.NULL).put("data", data)

  companion object {
    fun fromJson(o: JSONObject) = AlarmItem(
      id = o.getString("id"),
      tag = o.getString("tag"),
      at = o.getLong("at"),
      title = o.optString("title"),
      body = o.optString("body"),
      url = if (o.isNull("url")) null else o.optString("url"),
      data = o.optString("data", "{}"),
    )
  }
}

/**
 * Scheduled items and Skip/Done presses not yet handled by JS, kept across restarts. Plain
 * files read fresh every time (not SharedPreferences, which caches per process), because the
 * alarm receiver runs in its own process.
 */
object AlarmStore {
  private fun file(c: Context, name: String) = java.io.File(c.filesDir, "habit_alarms_$name.json")

  private fun read(c: Context, name: String): JSONArray = try {
    val f = file(c, name)
    if (f.exists()) JSONArray(f.readText()) else JSONArray()
  } catch (e: Exception) {
    Log.w(TAG, "Could not read $name", e)
    JSONArray()
  }

  /** Write via a temp file and rename, so a reader never sees half a file. */
  private fun write(c: Context, name: String, arr: JSONArray) {
    val tmp = java.io.File(c.filesDir, "habit_alarms_$name.tmp")
    tmp.writeText(arr.toString())
    if (!tmp.renameTo(file(c, name))) {
      file(c, name).writeText(arr.toString())
      tmp.delete()
    }
  }

  @Synchronized
  fun scheduled(c: Context): MutableMap<String, AlarmItem> {
    val arr = read(c, "scheduled")
    val out = LinkedHashMap<String, AlarmItem>()
    for (i in 0 until arr.length()) AlarmItem.fromJson(arr.getJSONObject(i)).let { out[it.id] = it }
    return out
  }

  @Synchronized
  fun saveScheduled(c: Context, items: Collection<AlarmItem>) {
    val arr = JSONArray()
    items.forEach { arr.put(it.toJson()) }
    write(c, "scheduled", arr)
  }

  @Synchronized
  fun remove(c: Context, ids: Collection<String>) {
    val all = scheduled(c)
    ids.forEach { all.remove(it) }
    saveScheduled(c, all.values)
  }

  @Synchronized
  fun queueAction(c: Context, action: JSONObject) {
    val arr = read(c, "actions")
    arr.put(action)
    write(c, "actions", arr)
  }

  @Synchronized
  fun takeActions(c: Context): JSONArray {
    val arr = read(c, "actions")
    write(c, "actions", JSONArray())
    return arr
  }
}

/** Sets and cancels the AlarmManager alarms. */
object AlarmScheduler {
  private fun pending(c: Context, id: String, create: Boolean): PendingIntent? {
    val intent = Intent(c, HabitAlarmReceiver::class.java)
      .setData(Uri.parse("uptic-habit-alarm://alarm/" + Uri.encode(id)))
      .putExtra("id", id)
    val flags = PendingIntent.FLAG_IMMUTABLE or
      (if (create) PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_NO_CREATE)
    return PendingIntent.getBroadcast(c, 0, intent, flags)
  }

  fun canScheduleExact(c: Context): Boolean {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
  }

  fun set(c: Context, item: AlarmItem) {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = pending(c, item.id, true) ?: return
    if (canScheduleExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)
    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, item.at, pi)
  }

  fun cancel(c: Context, id: String) {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    pending(c, id, false)?.let { am.cancel(it); it.cancel() }
  }

  /**
   * Make [items] exactly the set of scheduled alarms. Every alarm is set again, so ones the
   * system dropped (a force-stop wipes them) come back. Returns the ids of stored items
   * whose moment passed more than 2 minutes ago without firing: they were missed.
   */
  @Synchronized
  fun replaceAll(c: Context, items: List<AlarmItem>): List<String> {
    val now = System.currentTimeMillis()
    val old = AlarmStore.scheduled(c)
    val missed = old.values.filter { it.at < now - 120_000 }.map { it.id }
    val wanted = items.filter { it.at > now }.associateBy { it.id }
    old.keys.filter { it !in wanted }.forEach { cancel(c, it) }
    wanted.values.forEach { set(c, it) }
    AlarmStore.saveScheduled(c, wanted.values)
    return missed
  }

  /** After a reboot or app update: set every stored future alarm again. */
  fun restoreAll(c: Context) {
    val now = System.currentTimeMillis()
    val items = AlarmStore.scheduled(c)
    items.values.filter { it.at > now }.forEach { set(c, it) }
  }

  /** Cancel every remaining alarm of a session (its tag), e.g. after Done or Skip. */
  fun cancelTag(c: Context, tag: String) {
    val items = AlarmStore.scheduled(c).values.filter { it.tag == tag }
    items.forEach { cancel(c, it.id) }
    AlarmStore.remove(c, items.map { it.id })
  }
}

/** Builds and shows the notifications. */
object Notifier {
  const val CHANNEL = "habits"
  const val NOTIFY_ID = 4711
  const val EXTRA_ID = "uptic.habit.id"
  const val EXTRA_DATA = "uptic.habit.data"

  fun ensureChannel(c: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Habit sessions", NotificationManager.IMPORTANCE_HIGH))
    }
  }

  private fun smallIcon(c: Context): Int {
    val res = c.resources.getIdentifier("notification_icon", "drawable", c.packageName)
    return if (res != 0) res else c.applicationInfo.icon
  }

  private fun actionIntent(c: Context, item: AlarmItem, action: String): PendingIntent {
    val intent = Intent(c, HabitActionReceiver::class.java)
      .setData(Uri.parse("uptic-habit-action://$action/" + Uri.encode(item.id)))
      .putExtra("id", item.id).putExtra("tag", item.tag).putExtra("action", action).putExtra("data", item.data)
    return PendingIntent.getBroadcast(c, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun openIntent(c: Context, item: AlarmItem): PendingIntent? {
    val intent = (item.url?.let { Intent(Intent.ACTION_VIEW, Uri.parse(it)).setPackage(c.packageName) }
      ?: c.packageManager.getLaunchIntentForPackage(c.packageName))
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      ?: return null
    return PendingIntent.getActivity(
      c, item.id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  fun show(c: Context, item: AlarmItem) {
    ensureChannel(c)
    val n = NotificationCompat.Builder(c, CHANNEL)
      .setSmallIcon(smallIcon(c))
      .setColor(Color.parseColor("#2F6FF0"))
      .setContentTitle(item.title)
      .setContentText(item.body)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setContentIntent(openIntent(c, item))
      .addAction(0, "✕ Skip", actionIntent(c, item, "skip"))
      .addAction(0, "✓ Done", actionIntent(c, item, "done"))
      .addExtras(android.os.Bundle().apply {
        putString(EXTRA_ID, item.id)
        putString(EXTRA_DATA, item.data)
      })
      .build()
    try {
      NotificationManagerCompat.from(c).notify(item.tag, NOTIFY_ID, n)
    } catch (e: SecurityException) {
      Log.w(TAG, "Notification permission missing", e)
    }
  }

  /** Habit notifications on screen now: (id, data). */
  fun presented(c: Context): List<Pair<String, String>> {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return nm.activeNotifications.mapNotNull { sbn ->
      val id = sbn.notification.extras.getString(EXTRA_ID) ?: return@mapNotNull null
      id to (sbn.notification.extras.getString(EXTRA_DATA) ?: "{}")
    }
  }

  /** Take a notification down, but only while that exact one is showing for its tag. */
  fun dismiss(c: Context, id: String) {
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.activeNotifications
      .filter { it.id == NOTIFY_ID && it.notification.extras.getString(EXTRA_ID) == id }
      .forEach { nm.cancel(it.tag, it.id) }
  }

  fun dismissTag(c: Context, tag: String) {
    NotificationManagerCompat.from(c).cancel(tag, NOTIFY_ID)
  }
}

/**
 * An alarm went off: show its notification. Runs in the ":habitalarms" process, which then
 * ends itself, so HyperOS never gets to freeze it and hold back the next alarm.
 */
class HabitAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val pending = goAsync()
    try {
      val id = intent.getStringExtra("id")
      val item = id?.let { AlarmStore.scheduled(context)[it] }
      if (item != null) {
        Notifier.show(context, item)
        AlarmStore.remove(context, listOf(item.id))
      }
    } catch (e: Exception) {
      Log.w(TAG, "Showing habit notification failed", e)
    } finally {
      pending.finish()
      endOwnProcess()
    }
  }

  private fun endOwnProcess() {
    val inOwnProcess = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      android.app.Application.getProcessName().endsWith(":habitalarms")
    } else false
    if (!inOwnProcess) return
    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
      { android.os.Process.killProcess(android.os.Process.myPid()) }, 500,
    )
  }
}

/** Skip / Done: take the notification down, drop the session's other alarm, tell JS. */
class HabitActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val tag = intent.getStringExtra("tag") ?: return
    val action = intent.getStringExtra("action") ?: return
    Notifier.dismissTag(context, tag)
    AlarmScheduler.cancelTag(context, tag)
    val event = JSONObject()
      .put("id", id).put("action", action)
      .put("data", intent.getStringExtra("data") ?: "{}")
      .put("at", System.currentTimeMillis())
    val listener = HabitAlarmsEvents.onAction
    if (listener != null) listener(event) else AlarmStore.queueAction(context, event)
  }
}

/** Set the stored alarms again after a reboot or an app update. */
class HabitBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmScheduler.restoreAll(context)
  }
}

/** Set while JS is listening, so Skip/Done reach a running app at once. */
object HabitAlarmsEvents {
  @Volatile var onAction: ((JSONObject) -> Unit)? = null
}
