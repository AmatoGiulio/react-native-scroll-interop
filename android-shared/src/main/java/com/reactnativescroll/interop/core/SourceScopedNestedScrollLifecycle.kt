package com.reactnativescroll.interop.core

import android.view.ViewGroup
import androidx.core.view.ViewCompat

/**
 * Source-scoped ownership for one Android nested-scroll parent.
 *
 * The Android nested-scroll callback target is transaction authority. Tree discovery may prepare a
 * replacement source, but it must not grant authority before Android starts a session for that
 * concrete View instance.
 *
 * Momentum is owned by the source that emitted TYPE_NON_TOUCH. This is intentionally not a host
 * boolean: React/Fabric may destroy a source while momentum is active without delivering the
 * matching NON_TOUCH stop callback.
 *
 * This class owns no motion, velocity, deltas, timers, or Material state. It is a lifecycle kernel
 * shared by the production module and the bare React Native certification host.
 */
class SourceScopedNestedScrollLifecycle {
  data class Replacement(
    val previous: ViewGroup,
    val replacement: ViewGroup,
    val previousMomentumOwner: ViewGroup?,
  )

  enum class StopDecision {
    Stale,
    DeferTouchForMomentum,
    EndTouch,
    EndMomentum,
  }

  var activeSource: ViewGroup? = null
    private set

  var momentumSource: ViewGroup? = null
    private set

  /**
   * Grant transaction authority to [source]. Returns replacement metadata when authority moved from
   * a different concrete source instance.
   */
  fun begin(source: ViewGroup, type: Int): Replacement? {
    val previous = activeSource
    val previousMomentum = momentumSource
    val replacement =
      if (previous != null && previous !== source) {
        Replacement(
          previous = previous,
          replacement = source,
          previousMomentumOwner = previousMomentum,
        )
      } else {
        null
      }

    if (replacement != null) momentumSource = null
    activeSource = source
    if (type == ViewCompat.TYPE_NON_TOUCH) momentumSource = source

    return replacement
  }

  fun isActive(target: ViewGroup?): Boolean = target != null && activeSource === target

  fun isMomentumOwner(target: ViewGroup?): Boolean = target != null && momentumSource === target

  /**
   * Classify a stop before parent-helper state is mutated. Stale stops are fail-closed.
   */
  fun stop(target: ViewGroup, type: Int): StopDecision {
    if (activeSource !== target) return StopDecision.Stale

    if (type == ViewCompat.TYPE_NON_TOUCH) {
      if (momentumSource === target) momentumSource = null
      return StopDecision.EndMomentum
    }

    return if (momentumSource === target) {
      StopDecision.DeferTouchForMomentum
    } else {
      StopDecision.EndTouch
    }
  }

  /**
   * Discovery can invalidate an authority whose View left the tree, but it cannot activate the new
   * source. The replacement becomes authoritative only through [begin].
   */
  fun invalidateForDiscoveredReplacement(discovered: ViewGroup): Replacement? {
    val previous = activeSource ?: return null
    if (previous === discovered) return null

    val result =
      Replacement(
        previous = previous,
        replacement = discovered,
        previousMomentumOwner = momentumSource,
      )
    clear()
    return result
  }

  fun clear() {
    momentumSource = null
    activeSource = null
  }
}
