package io.github.mkdevtests.magnetcollector

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of the magnet basket's collect mode. Android only — see index.ts for
 * the iOS behaviour and why it differs.
 */
class MagnetCollectorModule : Module() {

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("MagnetCollector")

        /**
         * Everything captured while the app was closed, emptied as it is read.
         * JS folds these into the basket and dedupes them properly by info
         * hash; the native side only guards against an exact double-tap.
         */
        Function("drainPending") { MagnetCollectStore.drain(context) }

        Function("pendingCount") { MagnetCollectStore.count(context) }

        /**
         * Point the system's magnet handler at one of the two components.
         *
         * Both are declared in the manifest with the same intent filter, so
         * leaving both enabled would make Android ask the user which one to
         * use on every single magnet. They are flipped together and in this
         * order — enable the new target before disabling the old one — so a
         * link tapped mid-switch still finds a handler rather than falling
         * through to "no app can open this".
         */
        Function("setCollectModeEnabled") { enabled: Boolean ->
            val pm = context.packageManager
            if (enabled) {
                setEnabled(pm, collectActivity(), true)
                setEnabled(pm, launcherAlias(), false)
            } else {
                setEnabled(pm, launcherAlias(), true)
                setEnabled(pm, collectActivity(), false)
            }
        }

        Function("isCollectModeEnabled") {
            val state = context.packageManager.getComponentEnabledSetting(collectActivity())
            state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        }
    }

    private fun collectActivity() =
        ComponentName(context, MagnetCollectActivity::class.java)

    /**
     * The manifest alias that routes magnets to MainActivity in normal mode.
     * A plain intent filter on MainActivity could not be used: a filter cannot
     * be switched off on its own, and disabling MainActivity would take the
     * launcher icon with it. See plugins/withMagnetCollector.js.
     */
    private fun launcherAlias() =
        ComponentName(context.packageName, "${context.packageName}.MagnetLauncherAlias")

    private fun setEnabled(pm: PackageManager, component: ComponentName, enabled: Boolean) {
        val state = if (enabled) {
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        // DONT_KILL_APP: without it the system restarts our own process the
        // moment the user flips the switch, which looks exactly like a crash.
        pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
    }
}
