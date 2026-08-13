package com.material3scroll.transport

/**
 * Synchronous vertical nested-scroll fanout shared by the Expo production host and the bare
 * React Native certification host.
 *
 * The dispatcher owns no physics, velocity, source position, timers, or settle policy. Android's
 * nested-scroll callback remains the transaction clock. PRE consumers may withhold part of the
 * requested delta, POST consumers may consume only the still-unconsumed POST distance, and POST
 * observers can see child movement without ever affecting the parent's consumed array.
 */
class VerticalNestedScrollTransactionDispatcher(
  private val ledger: NestedScrollConservationLedger = NestedScrollConservationLedger(),
) {
  fun interface PreConsumer {
    fun consumePreScroll(availableY: Int, inputType: Int): Int
  }

  fun interface PostConsumer {
    fun consumePostScroll(childConsumedY: Int, availableY: Int, inputType: Int): Int
  }

  fun interface PostObserver {
    fun observePostScroll(childConsumedY: Int, inputType: Int)
  }

  data class PreDispatch(
    val consumedY: Int,
    val dispatched: Boolean,
    val ledgerResult: NestedScrollConservationLedger.BeginResult?,
  )

  data class PostDispatch(
    val consumedY: Int,
    val ledgerFrame: NestedScrollConservationLedger.Frame?,
  )

  private var preConsumers: List<PreConsumer> = emptyList()
  private var postConsumers: List<PostConsumer> = emptyList()
  private var postObservers: List<PostObserver> = emptyList()

  val hasParticipants: Boolean
    get() = preConsumers.isNotEmpty() || postConsumers.isNotEmpty() || postObservers.isNotEmpty()

  fun bind(
    preConsumers: List<PreConsumer>,
    postConsumers: List<PostConsumer>,
    postObservers: List<PostObserver>,
  ) {
    this.preConsumers = preConsumers
    this.postConsumers = postConsumers
    this.postObservers = postObservers
  }

  fun clearParticipants() {
    preConsumers = emptyList()
    postConsumers = emptyList()
    postObservers = emptyList()
  }

  fun dispatchPre(
    requestedY: Int,
    inputType: Int,
    trackConservation: Boolean,
  ): PreDispatch {
    if (requestedY == 0 || preConsumers.isEmpty()) {
      if (!trackConservation) ledger.discardPending()
      return PreDispatch(consumedY = 0, dispatched = false, ledgerResult = null)
    }

    var availableY = requestedY
    var consumedY = 0
    for (consumer in preConsumers) {
      if (availableY == 0) break
      val consumed = clampSignedConsumption(
        availableY,
        consumer.consumePreScroll(availableY, inputType),
      )
      consumedY += consumed
      availableY -= consumed
    }

    val ledgerResult =
      if (trackConservation) {
        ledger.beginFrame(requestedY, consumedY)
      } else {
        ledger.discardPending()
        null
      }

    return PreDispatch(
      consumedY = consumedY,
      dispatched = true,
      ledgerResult = ledgerResult,
    )
  }

  fun dispatchPost(
    childConsumedY: Int,
    availableY: Int,
    inputType: Int,
    trackConservation: Boolean,
  ): PostDispatch {
    var remainingAvailableY = availableY
    var consumedY = 0

    // Do not skip POST consumers when availableY == 0. Material behaviors can react to the
    // distance the child already consumed even when there is no remaining distance to take.
    for (consumer in postConsumers) {
      val consumed = clampSignedConsumption(
        remainingAvailableY,
        consumer.consumePostScroll(childConsumedY, remainingAvailableY, inputType),
      )
      consumedY += consumed
      remainingAvailableY -= consumed
    }

    // Observation happens only after all consuming POST participants and cannot affect consumedY.
    for (observer in postObservers) {
      observer.observePostScroll(childConsumedY, inputType)
    }

    val ledgerFrame =
      if (trackConservation) {
        ledger.completeFrame(childConsumedY, availableY, consumedY)
      } else {
        ledger.discardPending()
        null
      }

    return PostDispatch(consumedY = consumedY, ledgerFrame = ledgerFrame)
  }

  fun flushPending(): NestedScrollConservationLedger.OrphanPre? = ledger.flushPending()

  fun discardPending() = ledger.discardPending()

  fun snapshot(): NestedScrollConservationLedger.Snapshot = ledger.snapshot()

  private fun clampSignedConsumption(availableY: Int, consumedY: Int): Int {
    if (availableY == 0) return 0
    return if (availableY > 0) {
      consumedY.coerceIn(0, availableY)
    } else {
      consumedY.coerceIn(availableY, 0)
    }
  }
}
