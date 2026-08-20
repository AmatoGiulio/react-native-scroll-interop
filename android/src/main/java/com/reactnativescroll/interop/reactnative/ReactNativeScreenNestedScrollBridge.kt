package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.NestedScrollingParent3

/**
 * Neutral screen-owner adapter for a host ViewGroup that already owns a React Native screen.
 *
 * Navigation/container integrations only need this API. Source discovery/binding and AndroidX
 * parent callback forwarding stay inside the reusable RN boundary.
 */
class ReactNativeScreenNestedScrollBridge(
  private val owner: ViewGroup,
  private val isEnabled: () -> Boolean,
  private val sourceRoot: () -> ViewGroup,
) : NestedScrollingParent3 {
  private val controller = ReactNativeNestedScrollParentController(owner)
  private var ownerAttached = false
  private var waitingForLayout = false

  private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener {
    if (!owner.isAttachedToWindow || !isEnabled()) {
      stopWaitingForLayout()
      detachControllerIfNeeded()
      return@OnGlobalLayoutListener
    }
    ensureControllerAttached()
    if (prepareSource()) stopWaitingForLayout()
  }

  fun onOwnerAttached() {
    if (!owner.isAttachedToWindow || !isEnabled()) return
    ensureControllerAttached()
    requestBinding()
  }

  fun onOwnerLayout() {
    if (!owner.isAttachedToWindow || !isEnabled()) {
      stopWaitingForLayout()
      detachControllerIfNeeded()
      return
    }
    ensureControllerAttached()
    requestBinding()
  }

  fun onOwnerDetached() {
    stopWaitingForLayout()
    detachControllerIfNeeded()
  }

  private fun ensureControllerAttached() {
    if (ownerAttached) return
    controller.onOwnerAttached()
    ownerAttached = true
  }

  private fun detachControllerIfNeeded() {
    if (!ownerAttached) return
    controller.onOwnerDetached()
    ownerAttached = false
  }

  private fun requestBinding() {
    if (prepareSource()) stopWaitingForLayout() else startWaitingForLayout()
  }

  private fun prepareSource(): Boolean {
    if (!owner.isAttachedToWindow || !isEnabled()) return false
    val source = ReactNativeVerticalScrollSourceLocator.findUniqueDescendant(sourceRoot()) ?: return false
    return controller.prepareNestedSource(source)
  }

  private fun startWaitingForLayout() {
    if (waitingForLayout) return
    val observer = owner.viewTreeObserver
    if (!observer.isAlive) return
    observer.addOnGlobalLayoutListener(layoutListener)
    waitingForLayout = true
  }

  private fun stopWaitingForLayout() {
    if (!waitingForLayout) return
    val observer = owner.viewTreeObserver
    if (observer.isAlive) observer.removeOnGlobalLayoutListener(layoutListener)
    waitingForLayout = false
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    controller.onStartNestedScroll(child, target, axes)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) =
    controller.onNestedScrollAccepted(child, target, axes)

  override fun onStopNestedScroll(target: View) = controller.onStopNestedScroll(target)

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =
    controller.onNestedPreScroll(target, dx, dy, consumed)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) = controller.onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed)

  override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean =
    controller.onNestedPreFling(target, velocityX, velocityY)

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean = controller.onNestedFling(target, velocityX, velocityY, consumed)

  override fun getNestedScrollAxes(): Int = controller.getNestedScrollAxes()

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean =
    controller.onStartNestedScroll(child, target, axes, type)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) =
    controller.onNestedScrollAccepted(child, target, axes, type)

  override fun onStopNestedScroll(target: View, type: Int) = controller.onStopNestedScroll(target, type)

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) = controller.onNestedPreScroll(target, dx, dy, consumed, type)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) = controller.onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed, type)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) = controller.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
    consumed,
  )
}
