package com.reactnativescroll.interop.rnscreens

import android.view.View
import android.view.ViewGroup
import com.reactnativescroll.interop.reactnative.ReactNativeScreenNestedScrollBridge
import com.swmansion.rnscreens.common.nestedscroll.ScreenNestedScrollDelegate
import com.swmansion.rnscreens.common.nestedscroll.ScreenNestedScrollDelegateFactory
import com.swmansion.rnscreens.common.nestedscroll.ScreenNestedScrollInterop

object ReactNativeScreensNestedScrollInstaller {
  private val factory =
    ScreenNestedScrollDelegateFactory { screen ->
      BridgeDelegate(
        ReactNativeScreenNestedScrollBridge(
          owner = screen,
          isEnabled = { true },
          sourceRoot = { screen },
        ),
      )
    }

  @JvmStatic
  fun install() {
    ScreenNestedScrollInterop.installFactory(factory)
  }
}

private class BridgeDelegate(
  private val bridge: ReactNativeScreenNestedScrollBridge,
) : ScreenNestedScrollDelegate {
  override fun onScreenAttached(screen: ViewGroup) = bridge.onOwnerAttached()

  override fun onScreenDetached(screen: ViewGroup) = bridge.onOwnerDetached()

  override fun onScreenLayout(screen: ViewGroup) = bridge.onOwnerLayout()

  override fun onStartNestedScroll(
    child: View,
    target: View,
    axes: Int,
  ): Boolean = bridge.onStartNestedScroll(child, target, axes)

  override fun onNestedScrollAccepted(
    child: View,
    target: View,
    axes: Int,
  ) = bridge.onNestedScrollAccepted(child, target, axes)

  override fun onStopNestedScroll(target: View) = bridge.onStopNestedScroll(target)

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
  ) = bridge.onNestedPreScroll(target, dx, dy, consumed)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) = bridge.onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed)

  override fun onNestedPreFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
  ): Boolean = bridge.onNestedPreFling(target, velocityX, velocityY)

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean = bridge.onNestedFling(target, velocityX, velocityY, consumed)

  override fun getNestedScrollAxes(): Int = bridge.nestedScrollAxes

  override fun onStartNestedScroll(
    child: View,
    target: View,
    axes: Int,
    type: Int,
  ): Boolean = bridge.onStartNestedScroll(child, target, axes, type)

  override fun onNestedScrollAccepted(
    child: View,
    target: View,
    axes: Int,
    type: Int,
  ) = bridge.onNestedScrollAccepted(child, target, axes, type)

  override fun onStopNestedScroll(
    target: View,
    type: Int,
  ) = bridge.onStopNestedScroll(target, type)

  override fun onNestedPreScroll(
    target: View,
    dx: Int,
    dy: Int,
    consumed: IntArray,
    type: Int,
  ) = bridge.onNestedPreScroll(target, dx, dy, consumed, type)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) = bridge.onNestedScroll(target, dxConsumed, dyConsumed, dxUnconsumed, dyUnconsumed, type)

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) = bridge.onNestedScroll(
    target,
    dxConsumed,
    dyConsumed,
    dxUnconsumed,
    dyUnconsumed,
    type,
    consumed,
  )
}
