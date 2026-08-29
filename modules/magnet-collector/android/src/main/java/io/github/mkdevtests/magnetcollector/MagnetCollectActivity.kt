package io.github.mkdevtests.magnetcollector

import android.app.Activity
import android.os.Bundle
import android.widget.Toast

/**
 * Catches a magnet link and disappears, without ever showing qRemote.
 *
 * ## Why an activity at all
 *
 * Android hands a `magnet:` link to whichever activity declares the intent
 * filter, and starting one always brings its task forward — there is no way to
 * receive the link from JS without the app appearing. So the receiver has to be
 * a separate activity that is transparent and finishes immediately: the user
 * taps a magnet in their browser, sees a toast, and stays in the browser.
 *
 * ## Why it is not the main activity
 *
 * Two activities in one app declaring the same filter would make Android show a
 * disambiguation chooser on every magnet. Exactly one of the two is ever
 * enabled: `MagnetCollectorModule.setCollectModeEnabled` flips this activity
 * against the manifest's magnet activity-alias, so collect mode is a component
 * state rather than a branch taken after the app has already opened.
 *
 * ## The theme
 *
 * `Theme.Translucent.NoTitleBar`, set by plugins/withMagnetCollector.js —
 * NOT `Theme.NoDisplay`, which throws IllegalStateException on Android 8+ if
 * the activity is ever resumed before finishing, and is a documented crash for
 * exactly this pattern. Translucent draws nothing visible and is safe. The
 * transition is suppressed too, so there is no flash of the browser dimming.
 */
class MagnetCollectActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        overridePendingTransition(0, 0)

        val magnet = intent?.dataString?.trim()
        val message = when {
            magnet.isNullOrEmpty() -> null
            !magnet.startsWith("magnet:", ignoreCase = true) -> null
            MagnetCollectStore.append(this, magnet) -> {
                val n = MagnetCollectStore.count(this)
                resources.getQuantityString(R.plurals.magnet_collected, n, n)
            }
            else -> getString(R.string.magnet_already_collected)
        }

        // A silent capture with no feedback at all is indistinguishable from
        // the link doing nothing, so this one toast stays even in "silent"
        // mode. It is the only UI this activity ever produces.
        if (message != null) {
            Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
        }

        finish()
        overridePendingTransition(0, 0)
    }
}
