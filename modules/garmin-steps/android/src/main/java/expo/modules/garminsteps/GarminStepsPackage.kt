package expo.modules.garminsteps

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/** Starts the watch receiver with the app process, before (or without) any React screen. */
class GarminStepsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        GarminStepsReceiver.start(application)
      }
    })
}
