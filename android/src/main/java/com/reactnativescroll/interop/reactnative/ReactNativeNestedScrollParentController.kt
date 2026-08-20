package com.reactnativescroll.interop.reactnative

import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup

/**
 * Stable React Native nested-scroll parent facade.
 *
 * Transaction lifecycle and conservation live in [ReactNativeNestedScrollControllerCore]. Native
 * consumers are supplied through the neutral participant-provider boundary; this class contains no
 * Material3, navigation-library, Expo or react-native-screens knowledge.
 */
class ReactNativeNestedScrollParentController(
  private val owner: ViewGroup,
) {
  private val core = ReactNativeNestedScrollControllerCore(owner, this)

  internal val ownerView: ViewGroup
    get() = owner

  fun traceTouchEvent(event: MotionEvent) = core.traceTouchEvent(event)

  fun traceNoReactVerticalSource(childCount: Int) = core.traceNoReactVerticalSource(childCount)

  fun traceAmbiguousReactSources(count: Int) = core.traceAmbiguousReactSources(count)

  fun ensureNestedScrollingEnabled(source: ViewGroup) = core.ensureNestedScrollingEnabled(source)

  fun prepareNestedSource(source: ViewGroup): Boolean = core.prepareNestedSource(source)

  fun onOwnerAttached() = core.onOwnerAttached()

  fun onOwnerDetached() = core.onOwnerDetached()

  internal fun requestNestedParticipantBindingRefresh() =
    core.requestNestedParticipantBindingRefresh()

  fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    core.onStartNestedScroll(child, target, axes)

  fun onNestedScrollAccepted(child: View, target: View, axes: Int) =
    core.onNestedScrollAccepted(child, target, axes)

  fun onStopNestedScroll(target: View) = core.onStopNestedScroll(target)

  fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =
    core.onNestedPreScroll(target, dx, dy, consumed)

  fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) = core.onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed)

  fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean =
    core.onNestedPreFling(target, velocityX, velocityY)

  fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean = core.onNestedFling(target, velocityX, velocityY, consumed)

  fun getNestedScrollAxes(): Int = core.nestedScrollAxes()

  fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean =
    core.onStartNestedScroll(child, target, axes, type)

  fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) =
    core.onNestedScrollAccepted(child, target, axes, type)

  fun onStopNestedScroll(target: View, type: Int) = core.onStopNestedScroll(target, type)

  fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) = core.onNestedPreScroll(target, dx, dy, consumed, type)

  fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) = core.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
  )

  fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) = core.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
    consumed,
  )
}
