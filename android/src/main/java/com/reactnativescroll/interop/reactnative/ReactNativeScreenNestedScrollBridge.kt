package com.reactnativescroll.interop.reactnative

import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.NestedScrollingParent3

/**
 * Neutral screen-owner adapter for a host ViewGroup that already owns a React Native screen.
 *
 * This is the only API a navigation-container integration needs. It owns source discovery/binding
 * lifecycle and forwards AndroidX nested-parent callbacks to the reusable RN controller. It has no
 * Material3 or navigation-library dependency, which makes it suitable for a react-native-screens
 * upstream integration or any other screen/container implementation.
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

  /** Call from the owning View's onAttachedToWindow(). */
  fun onOwnerAttached() {
    if (!owner.isAttachedToWindow || !isEnabled()) return
    ensureControllerAttached()
    requestBinding()
  }

  /** Call after layout/content changes that may install or replace the RN vertical source. */
  fun onOwnerLayout() {
    if (!owner.isAttachedToWindow || !isEnabled()) {
      stopWaitingForLayout()
      detachControllerIfNeeded()
      return
    }
    ensureControllerAttached()
    requestBinding()
  }

  /** Call from the owning View's onDetachedFromWindow(). */
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
