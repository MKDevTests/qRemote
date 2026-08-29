/**
 * index.ts — JS entry point for the InsecureCertAllowlist local native module.
 *
 * Bridges the per-server "allow self-signed certificate" opt-in in JS to the
 * native TLS trust decision, which neither platform exposes any other way:
 *
 *  - iOS: React Native's default HTTP handler never implements the TLS
 *    challenge delegate method, so it always falls through to system trust
 *    evaluation with no override point — not even for a certificate the user
 *    manually trusted on-device. See ios/RCTHTTPRequestHandler+InsecureCert.m.
 *  - Android: OkHttp does allow a custom trust manager, so the equivalent is a
 *    replacement client factory that tries real validation first and only falls
 *    back to the allowlist. See
 *    android/.../InsecureCertOkHttpClientFactory.kt.
 */
interface InsecureCertAllowlistNativeModule {
  setAllowedHosts(hosts: string[]): void;
}

// Deliberately `require`d rather than statically imported: expo-modules-core
// ships untranspiled TS/ESM source that plain ts-jest (the `node` Jest
// project — see services/server-manager.ts, which imports this file) can't
// parse. A static `import` gets hoisted to an unconditional require outside
// this try/catch; a runtime require keeps the failure containable here.
let nativeModule: InsecureCertAllowlistNativeModule | null = null;
try {
  const { requireNativeModule } = require('expo-modules-core') as {
    requireNativeModule: (name: string) => InsecureCertAllowlistNativeModule;
  };
  nativeModule = requireNativeModule('InsecureCertAllowlist');
} catch {
  // Not available (e.g. the `node` Jest project, or jest-expo mocking native
  // modules generically without knowing this one). Safe to no-op: without a
  // native side the toggle simply does nothing, which is the same as before it
  // was implemented.
  nativeModule = null;
}

/** Push the current set of hostnames allowed to bypass TLS trust evaluation. */
export function setInsecureCertAllowedHosts(hosts: string[]): void {
  nativeModule?.setAllowedHosts(hosts);
}
