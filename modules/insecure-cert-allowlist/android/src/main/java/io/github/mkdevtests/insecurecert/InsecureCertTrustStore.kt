package io.github.mkdevtests.insecurecert

import java.util.Collections

/**
 * Thread-safe host allowlist, written from JS via InsecureCertAllowlistModule
 * and read from InsecureCertOkHttpClientFactory's trust manager during the TLS
 * handshake.
 *
 * The Android counterpart of ios/InsecureCertTrustStore.swift, and deliberately
 * the same shape: a set of lowercased hostnames, replaced wholesale on every
 * write, because services/server-manager.ts pushes the complete list after
 * every read or mutation of the server list rather than diffing it.
 */
object InsecureCertTrustStore {
    @Volatile
    private var hosts: Set<String> = emptySet()

    @JvmStatic
    fun setAllowedHosts(newHosts: List<String>) {
        hosts = Collections.unmodifiableSet(
            newHosts.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet(),
        )
    }

    @JvmStatic
    fun isHostAllowed(host: String?): Boolean {
        if (host.isNullOrBlank()) return false
        return hosts.contains(host.trim().lowercase())
    }

    /** True when nothing is allow-listed — lets the factory skip its own work. */
    @JvmStatic
    fun isEmpty(): Boolean = hosts.isEmpty()
}
