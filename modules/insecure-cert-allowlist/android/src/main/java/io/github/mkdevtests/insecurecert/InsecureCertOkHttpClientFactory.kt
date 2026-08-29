package io.github.mkdevtests.insecurecert

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import java.net.Socket
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedTrustManager
import okhttp3.OkHttpClient

/**
 * Installs a TLS trust path that defers to the platform for every host except
 * the ones the user has explicitly opted out for.
 *
 * ## Why this exists
 *
 * qRemote talks to servers its users run themselves, and a large share of those
 * sit behind a self-signed certificate. Android rejects those with a
 * `CertPathValidatorException` and no override point, so the per-server "Allow
 * Self-Signed Certificate" toggle had no Android implementation at all: the
 * switch saved, and the connection failed anyway. This is that implementation.
 *
 * ## How the scoping works
 *
 * `X509ExtendedTrustManager` (API 24+, and minSdk here is 24) is the only trust
 * manager variant that is handed the `Socket` / `SSLEngine` of the connection
 * being validated. That is what makes per-host scoping possible: the plain
 * two-argument `X509TrustManager.checkServerTrusted` receives the certificate
 * chain and nothing identifying the peer, which is why the naive
 * "trust-everything" trust manager found in most snippets cannot be limited to
 * one host and disables validation for the whole app.
 *
 * The order is deliberate: **always try real validation first**, and only
 * consult the allowlist when it fails. A host on the allowlist whose
 * certificate is in fact valid is still validated normally, so adding a server
 * to the list never silently weakens a connection that was already sound.
 *
 * Hostname verification is relaxed the same way and only for the same hosts —
 * a self-signed certificate usually carries a CN that matches nothing.
 *
 * ## What this is not
 *
 * It is not certificate pinning and it is not a substitute for trust. For an
 * allow-listed host, anyone able to intercept the connection can present any
 * certificate and be believed. That is the meaning of the toggle, it is off by
 * default, and it applies to exactly one host at a time.
 */
class InsecureCertOkHttpClientFactory : OkHttpClientFactory {

    override fun createNewNetworkModuleClient(): OkHttpClient {
        val builder = OkHttpClientProvider.createClientBuilder()

        val platformTrustManager = defaultTrustManager()
        if (platformTrustManager == null) {
            // No usable platform trust manager: leave React Native's default
            // client completely untouched rather than substituting something
            // weaker. The toggle then does nothing, which is the safe failure.
            return builder.build()
        }

        val allowlistTrustManager = AllowlistTrustManager(platformTrustManager)
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(null, arrayOf(allowlistTrustManager), null)
        }

        return builder
            .sslSocketFactory(sslContext.socketFactory, allowlistTrustManager)
            .hostnameVerifier { hostname, session ->
                // Default verification first, for the same reason as above. The
                // platform verifier is captured once — building an OkHttpClient
                // per handshake just to read its verifier would allocate a full
                // connection pool on every TLS connection.
                DEFAULT_HOSTNAME_VERIFIER.verify(hostname, session) ||
                    InsecureCertTrustStore.isHostAllowed(hostname)
            }
            .build()
    }

    /** The system's own trust manager, or null if the platform has no usable one. */
    private fun defaultTrustManager(): X509ExtendedTrustManager? {
        val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
        factory.init(null as KeyStore?)
        return factory.trustManagers.filterIsInstance<X509ExtendedTrustManager>().firstOrNull()
    }

    /**
     * Delegates every check to the platform, and swallows a server-side failure
     * only when the peer's hostname is on the allowlist.
     *
     * Client-certificate checks are delegated unconditionally: this toggle is
     * about trusting a server we cannot verify, never about how we authenticate
     * ourselves.
     */
    private class AllowlistTrustManager(
        private val delegate: X509ExtendedTrustManager,
    ) : X509ExtendedTrustManager() {

        override fun checkServerTrusted(
            chain: Array<out X509Certificate>?,
            authType: String?,
            socket: Socket?,
        ) {
            try {
                delegate.checkServerTrusted(chain, authType, socket)
            } catch (e: CertificateException) {
                if (!InsecureCertTrustStore.isHostAllowed(peerHost(socket))) throw e
            }
        }

        override fun checkServerTrusted(
            chain: Array<out X509Certificate>?,
            authType: String?,
            engine: SSLEngine?,
        ) {
            try {
                delegate.checkServerTrusted(chain, authType, engine)
            } catch (e: CertificateException) {
                if (!InsecureCertTrustStore.isHostAllowed(peerHost(engine))) throw e
            }
        }

        /**
         * The two-argument overload carries no peer identity, so there is
         * nothing to scope an exception to. Delegating it unchanged means a
         * caller that reaches this path gets ordinary, strict validation —
         * never a blanket bypass.
         */
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
            delegate.checkServerTrusted(chain, authType)
        }

        override fun checkClientTrusted(
            chain: Array<out X509Certificate>?,
            authType: String?,
            socket: Socket?,
        ) = delegate.checkClientTrusted(chain, authType, socket)

        override fun checkClientTrusted(
            chain: Array<out X509Certificate>?,
            authType: String?,
            engine: SSLEngine?,
        ) = delegate.checkClientTrusted(chain, authType, engine)

        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) =
            delegate.checkClientTrusted(chain, authType)

        override fun getAcceptedIssuers(): Array<X509Certificate> = delegate.acceptedIssuers

        /**
         * `handshakeSession` is the JSSE-specified way to learn who we are
         * talking to from inside a trust check — `socket.inetAddress` would give
         * a reverse-DNS name or a bare IP, neither of which matches what the
         * user typed into the server form.
         */
        private fun peerHost(socket: Socket?): String? =
            (socket as? SSLSocket)?.handshakeSession?.peerHost

        private fun peerHost(engine: SSLEngine?): String? = engine?.handshakeSession?.peerHost
    }

    companion object {
        private val DEFAULT_HOSTNAME_VERIFIER: HostnameVerifier =
            HttpsURLConnection.getDefaultHostnameVerifier()

        @Volatile
        private var installed = false

        /**
         * Replace React Native's OkHttp factory, once.
         *
         * Must run before the first network request, because
         * OkHttpClientProvider caches the client it builds. The module's
         * `OnCreate` is early enough: Expo instantiates modules while the React
         * instance is still starting, before any JS has run.
         */
        @JvmStatic
        @Synchronized
        fun install() {
            if (installed) return
            OkHttpClientProvider.setOkHttpClientFactory(InsecureCertOkHttpClientFactory())
            installed = true
        }
    }
}
