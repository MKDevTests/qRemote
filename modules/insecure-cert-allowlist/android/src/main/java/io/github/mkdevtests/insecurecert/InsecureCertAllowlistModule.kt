package io.github.mkdevtests.insecurecert

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android counterpart of ios/InsecureCertAllowlistModule.swift — same module
 * name and same single function, so index.ts needs no platform branch.
 */
class InsecureCertAllowlistModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("InsecureCertAllowlist")

        // Replace React Native's OkHttp factory here rather than in
        // MainApplication: OnCreate runs while the React instance is still
        // starting, before any JS has executed and therefore before the first
        // request causes OkHttpClientProvider to cache a client. Doing it from
        // MainApplication would mean patching a generated file with a config
        // plugin for no extra guarantee.
        OnCreate {
            InsecureCertOkHttpClientFactory.install()
        }

        Function("setAllowedHosts") { hosts: List<String> ->
            InsecureCertTrustStore.setAllowedHosts(hosts)
        }
    }
}
