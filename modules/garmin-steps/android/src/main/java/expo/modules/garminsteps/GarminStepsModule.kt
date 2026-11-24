package expo.modules.garminsteps

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

/** JS access to the watch's step totals. */
class GarminStepsModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("GarminSteps")

    Events("onDays")

    /** Every stored day as JSON: { "YYYY-MM-DD": { s, m, c, at } }. */
    Function("getDays") { StepStore.json(context) }

    Function("getStatus") {
      mapOf(
        "ready" to GarminStepsReceiver.ready,
        "error" to GarminStepsReceiver.error,
        "lastAt" to StepStore.lastAt(context).toDouble(),
      )
    }

    /** Writes every stored day to Health Connect again (after permission was granted). */
    AsyncFunction("writeHealth") { promise: Promise ->
      GarminStepsReceiver.rewriteHealth(context) { promise.resolve(null) }
    }

    OnCreate { GarminStepsReceiver.start(context) }

    OnStartObserving {
      GarminStepsReceiver.onDays = { days ->
        val arr = JSONArray()
        days.forEach { d -> arr.put(JSONObject().put("date", d.date).put("steps", d.steps).put("metres", d.metres).put("kcal", d.kcal)) }
        sendEvent("onDays", mapOf("json" to arr.toString()))
      }
    }

    OnStopObserving { GarminStepsReceiver.onDays = null }
  }
}
