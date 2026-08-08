package com.materialtoolbar.interop

import android.view.View

/**
 * Per-host registration facade over one process-wide transport.
 *
 * Every mounted piece of native chrome creates its own coordinator, but they all share a single
 * transport instance: one scroll observer for the whole process, fanned out to whichever chrome is
 * eligible. A TopAppBar and a FloatingToolbar on the same screen therefore see the same samples
 * from the same source, sampled once.
 *
 * This class holds no transport knowledge. Swapping [NativeScrollTransport] swaps the entire
 * source side without touching consumers.
 */
class NativeScrollCoordinator(
  ownerView: View,
  consumers: List<NativeScrollConsumer>,
) {
  constructor(ownerView: View, consumer: NativeScrollConsumer) : this(ownerView, listOf(consumer))

  private val client = Client(ownerView, consumers)

  fun attach() = Hub.register(client)

  fun detach() = Hub.unregister(client)

  /**
   * Ask the transport to look for a source now, rather than waiting for the next scroll. Hosts call
   * this after their geometry changes, because a newly measured chrome height changes how much
   * space the source must reserve.
   */
  fun discoverSources() = Hub.discoverFor(client)

  internal class Client(
    val ownerView: View,
    val consumers: List<NativeScrollConsumer>,
  ) {
    fun hasEnabledConsumer(): Boolean = consumers.any { it.isEnabled }

    fun isEligibleFor(source: NativeScrollSource): Boolean {
      if (!ownerView.isAttachedToWindow || !ownerView.isShown) return false
      if (ownerView.windowVisibility != View.VISIBLE) return false
      return source.isEligibleFor(ownerView)
    }

    fun sourceAvailable(source: NativeScrollSource) {
      consumers.forEach { if (it.isEnabled) it.onScrollSourceAvailable(source) }
    }

    fun sourceUnavailable(source: NativeScrollSource) {
      consumers.forEach { it.onScrollSourceUnavailable(source) }
    }

    fun sessionStart(source: NativeScrollSource) {
      sourceAvailable(source)
      consumers.forEach { if (it.isEnabled) it.onScrollSessionStart(source) }
    }

    fun frame(frame: NativeScrollFrame) {
      consumers.forEach { if (it.isEnabled) it.onScrollFrame(frame) }
    }

    fun sessionEnd(velocityY: Float) {
      consumers.forEach { it.onScrollSessionEnd(velocityY) }
    }
  }

  companion object Hub : NativeScrollTransport.Sink {
    /**
     * Swappable for tests and for a future upstream transport. Assign before the first chrome host
     * attaches.
     */
    @JvmStatic
    var transport: NativeScrollTransport = ReactScrollViewTransport()
      set(value) {
        if (field === value) return
        if (transportStarted) {
          field.stop()
          transportStarted = false
        }
        field = value
        if (clients.isNotEmpty()) {
          value.start(this)
          transportStarted = true
        }
      }

    private val clients = LinkedHashSet<Client>()
    private val sessions = LinkedHashMap<NativeScrollSource, MutableList<Client>>()
    private var transportStarted = false

    internal fun register(client: Client) {
      if (!clients.add(client)) return
      if (!transportStarted) {
        transport.start(this)
        transportStarted = true
      }
      transport.discoverFor(client.ownerView)
    }

    internal fun unregister(client: Client) {
      if (!clients.remove(client)) return

      // Tell this client about every source it was still holding, so a consumer can restore any
      // geometry it had reserved before its host goes away.
      sessions.forEach { (source, sessionClients) ->
        if (sessionClients.remove(client)) client.sourceUnavailable(source)
      }
      sessions.entries.removeAll { it.value.isEmpty() }

      if (clients.isEmpty()) {
        sessions.clear()
        if (transportStarted) {
          transport.stop()
          transportStarted = false
        }
      }
    }

    internal fun discoverFor(client: Client) {
      if (client !in clients || !client.hasEnabledConsumer()) return
      transport.discoverFor(client.ownerView)
    }

    private fun eligibleClients(source: NativeScrollSource): List<Client> =
      clients.filter { it.hasEnabledConsumer() && it.isEligibleFor(source) }

    override fun onSourceAvailable(source: NativeScrollSource) {
      eligibleClients(source).forEach { it.sourceAvailable(source) }
    }

    override fun onSourceUnavailable(source: NativeScrollSource) {
      sessions.remove(source)?.forEach { it.sourceUnavailable(source) }
        ?: clients.forEach { it.sourceUnavailable(source) }
    }

    override fun onSessionStart(source: NativeScrollSource) {
      val eligible = eligibleClients(source)
      if (eligible.isEmpty()) return
      sessions[source] = eligible.toMutableList()
      eligible.forEach { it.sessionStart(source) }
    }

    override fun onFrame(source: NativeScrollSource, frame: NativeScrollFrame) {
      val sessionClients = sessions[source] ?: return
      // Eligibility can change mid-session: a tab switch hides a host, a screen is popped. Drop
      // those clients instead of letting an off-screen list drive visible chrome.
      var index = 0
      while (index < sessionClients.size) {
        val client = sessionClients[index]
        if (client in clients && client.hasEnabledConsumer() && client.isEligibleFor(source)) {
          client.frame(frame)
          index += 1
        } else {
          sessionClients.removeAt(index)
        }
      }
      if (sessionClients.isEmpty()) sessions.remove(source)
    }

    override fun onSessionEnd(source: NativeScrollSource, velocityY: Float) {
      sessions.remove(source)?.forEach { client ->
        if (client in clients) client.sessionEnd(velocityY)
      }
    }

    override fun isSourceRelevant(source: NativeScrollSource): Boolean =
      clients.any { it.hasEnabledConsumer() && it.isEligibleFor(source) }
  }
}
