package expo.modules.garminsteps

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Writes the watch's daily totals to Health Connect: one Steps, Distance and Total calories
 * record per day. Each record's clientRecordId is tied to its day, so writing a day again
 * replaces it. Only days whose values changed since the last write are sent.
 */
object HealthWriter {
  private const val PREFS = "uptic_garmin_steps"
  private val mutex = Mutex()
  private val device = Device(Device.TYPE_WATCH, "Garmin", "Venu 2S")

  suspend fun write(context: Context, days: List<DayTotal>, force: Boolean = false): Unit = mutex.withLock {
    try {
      if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return@withLock
      val client = HealthConnectClient.getOrCreate(context)
      val granted = client.permissionController.getGrantedPermissions()
      val canSteps = HealthPermission.getWritePermission(StepsRecord::class) in granted
      val canDistance = HealthPermission.getWritePermission(DistanceRecord::class) in granted
      val canKcal = HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class) in granted
      if (!canSteps && !canDistance && !canKcal) return@withLock

      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      val written = if (force) JSONObject() else JSONObject(prefs.getString("hcWritten", "{}") ?: "{}")
      val zone = ZoneId.systemDefault()
      val now = Instant.now()
      val version = System.currentTimeMillis()
      val records = mutableListOf<Record>()
      val sigs = mutableMapOf<String, String>()

      for (d in days) {
        val sig = "${d.steps}|${d.metres}|${d.kcal}|$canSteps$canDistance$canKcal"
        if (written.optString(d.date) == sig) continue
        val day = LocalDate.parse(d.date)
        val start = day.atStartOfDay(zone).toInstant()
        val dayEnd = day.plusDays(1).atStartOfDay(zone).toInstant()
        // Today's record runs until now; past days cover the whole day.
        val end = if (now.isBefore(dayEnd)) maxOf(now, start.plusSeconds(60)) else dayEnd
        if (!end.isAfter(start)) continue
        val so = zone.rules.getOffset(start)
        val eo = zone.rules.getOffset(end)
        fun meta(kind: String) = Metadata.autoRecorded(device, "uptic-$kind-${d.date}", version)

        if (canSteps && d.steps in 1..1_000_000) {
          records += StepsRecord(start, so, end, eo, d.steps, meta("steps"))
        }
        if (canDistance && d.metres in 1..1_000_000) {
          records += DistanceRecord(start, so, end, eo, Length.meters(d.metres.toDouble()), meta("distance"))
        }
        if (canKcal && d.kcal in 1..100_000) {
          records += TotalCaloriesBurnedRecord(start, so, end, eo, Energy.kilocalories(d.kcal.toDouble()), meta("kcal"))
        }
        sigs[d.date] = sig
      }
      if (records.isEmpty()) return@withLock
      client.insertRecords(records)
      sigs.forEach { (k, v) -> written.put(k, v) }
      prefs.edit().putString("hcWritten", written.toString()).apply()
    } catch (e: Exception) {
      Log.w(GarminStepsReceiver.TAG, "Health Connect write failed", e)
    }
  }
}
