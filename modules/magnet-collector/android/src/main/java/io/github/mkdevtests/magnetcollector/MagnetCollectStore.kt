package io.github.mkdevtests.magnetcollector

import android.content.Context
import org.json.JSONArray

/**
 * The inbox between the invisible collect activity and JS.
 *
 * Deliberately NOT the basket itself. JS owns the basket (AsyncStorage, through
 * MagnetBasketContext); this is a one-way drop box that the activity appends to
 * while the app may not even be running, and that JS drains on the next
 * foreground. Two writers over one store would be a synchronisation problem for
 * no benefit — here, only the activity ever writes and only JS ever drains.
 *
 * SharedPreferences rather than a file: the activity has milliseconds to live
 * and `commit()` gives a synchronous, atomic write that is guaranteed to have
 * landed before `finish()` returns. `apply()` would be asynchronous, and the
 * process can be killed the instant the activity ends.
 */
object MagnetCollectStore {
    private const val PREFS = "qremote_magnet_collector"
    private const val KEY_PENDING = "pending"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun read(context: Context): MutableList<String> {
        val raw = prefs(context).getString(KEY_PENDING, null) ?: return mutableListOf()
        return try {
            val array = JSONArray(raw)
            MutableList(array.length()) { array.getString(it) }
        } catch (_: Exception) {
            // A corrupted store must not make every future collect fail. JS
            // does the same for its own basket (utils/magnet-basket.ts).
            mutableListOf()
        }
    }

    private fun write(context: Context, items: List<String>) {
        val array = JSONArray()
        items.forEach { array.put(it) }
        prefs(context).edit().putString(KEY_PENDING, array.toString()).commit()
    }

    /**
     * Append one magnet. Returns false when it was already pending.
     *
     * Duplicate detection here is exact-string only: parsing an info hash is
     * JS's job, and repeating that logic in Kotlin would give two
     * implementations to keep in step. This only catches the double-tap case;
     * JS dedupes properly by hash when it drains.
     */
    @Synchronized
    fun append(context: Context, magnet: String): Boolean {
        val items = read(context)
        if (items.contains(magnet)) return false
        items.add(magnet)
        write(context, items)
        return true
    }

    /** Return everything pending and empty the store, atomically. */
    @Synchronized
    fun drain(context: Context): List<String> {
        val items = read(context)
        if (items.isNotEmpty()) write(context, emptyList())
        return items
    }

    @Synchronized
    fun count(context: Context): Int = read(context).size
}
