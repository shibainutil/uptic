package expo.modules.habitalarms

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/**
 * Uptic's own scheduler for habit notifications (Android): exact alarms, notifications that
 * replace each other per habit session, Skip / Done buttons. Items cross the bridge as JSON.
 */
class HabitAlarmsModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("HabitAlarms")

    Events("onAction")

    /** Replace all scheduled alarms with these items; returns ids of missed ones. */
    Function("replaceAll") { itemsJson: String ->
      val arr = JSONArray(itemsJson)
      val items = (0 until arr.length()).map { AlarmItem.fromJson(arr.getJSONObject(it)) }
      AlarmScheduler.replaceAll(context, items)
    }

    /** Ids and times of the alarms still to come: [{ id, at }]. */
    Function("scheduled") {
      val arr = JSONArray()
      AlarmStore.scheduled(context).values.forEach { arr.put(JSONObject().put("id", it.id).put("at", it.at)) }
      arr.toString()
    }

    /** Show an item right away (replacing the notification of its session). */
    Function("show") { itemJson: String ->
      Notifier.show(context, AlarmItem.fromJson(JSONObject(itemJson)))
    }

    /** Habit notifications on screen now: [{ id, data }]. */
    Function("presented") {
      val arr = JSONArray()
      Notifier.presented(context).forEach { (id, data) -> arr.put(JSONObject().put("id", id).put("data", data)) }
      arr.toString()
    }

    /** Take one down, only while that exact notification is the one showing. */
    Function("dismiss") { id: String -> Notifier.dismiss(context, id) }

    /** Skip / Done presses made while the app wasn't listening. */
    Function("takeActions") { AlarmStore.takeActions(context).toString() }

    Function("canScheduleExact") { AlarmScheduler.canScheduleExact(context) }

    OnStartObserving {
      HabitAlarmsEvents.onAction = { e -> sendEvent("onAction", mapOf("json" to e.toString())) }
    }

    OnStopObserving { HabitAlarmsEvents.onAction = null }
  }
}
