package com.rn087nestedscrollprobe

import android.content.Context
import android.util.Log
import android.view.View
import android.widget.FrameLayout
import androidx.core.view.NestedScrollingParent3
import androidx.core.view.NestedScrollingParentHelper
import androidx.core.view.ViewCompat

class NestedScrollProbeLayout(context: Context) : FrameLayout(context), NestedScrollingParent3 {
  private val parentHelper = NestedScrollingParentHelper(this)

  private fun typeName(type: Int): String =
    if (type == ViewCompat.TYPE_NON_TOUCH) "NON_TOUCH" else "TOUCH"

  private fun targetName(target: View): String =
    "${target.javaClass.name}#${Integer.toHexString(System.identityHashCode(target))}"

  private fun log(message: String) {
    Log.i("Rn087NestedScroll", message)
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean {
    val accepted = axes and ViewCompat.SCROLL_AXIS_VERTICAL != 0
    log(
      "NESTED_START contract=androidx type=${typeName(type)} axes=$axes accepted=$accepted target=${targetName(target)}",
    )
    return accepted
  }

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) {
    parentHelper.onNestedScrollAccepted(child, target, axes, type)
  }

  override fun onStopNestedScroll(target: View, type: Int) {
    log("NESTED_STOP contract=androidx type=${typeName(type)} target=${targetName(target)}")
    parentHelper.onStopNestedScroll(target, type)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray, type: Int) {
    log(
      "NESTED_PRE type=${typeName(type)} dx=$dx dy=$dy consumedX=${consumed[0]} consumedY=${consumed[1]} target=${targetName(target)}",
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
    consumed: IntArray,
  ) {
    log(
      "NESTED_POST type=${typeName(type)} childConsumedY=$dyConsumed remainingY=$dyUnconsumed parentConsumedY=${consumed[1]} target=${targetName(target)}",
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
    type: Int,
  ) {
    log(
      "NESTED_POST type=${typeName(type)} childConsumedY=$dyConsumed remainingY=$dyUnconsumed target=${targetName(target)}",
    )
  }

  override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =
    onStartNestedScroll(child, target, axes, ViewCompat.TYPE_TOUCH)

  override fun onNestedScrollAccepted(child: View, target: View, axes: Int) {
    parentHelper.onNestedScrollAccepted(child, target, axes)
  }

  override fun onStopNestedScroll(target: View) {
    log("NESTED_STOP contract=platform type=TOUCH target=${targetName(target)}")
    parentHelper.onStopNestedScroll(target)
  }

  override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) {
    log(
      "NESTED_PRE type=TOUCH dx=$dx dy=$dy consumedX=${consumed[0]} consumedY=${consumed[1]} target=${targetName(target)}",
    )
  }

  override fun onNestedScroll(
    target: View,
    dxConsumed: Int,
    dyConsumed: Int,
    dxUnconsumed: Int,
    dyUnconsumed: Int,
  ) {
    log(
      "NESTED_POST type=TOUCH childConsumedY=$dyConsumed remainingY=$dyUnconsumed target=${targetName(target)}",
    )
  }

  override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean {
    log("NESTED_PRE_FLING vx=$velocityX vy=$velocityY target=${targetName(target)}")
    return false
  }

  override fun onNestedFling(
    target: View,
    velocityX: Float,
    velocityY: Float,
    consumed: Boolean,
  ): Boolean {
    log(
      "NESTED_FLING vx=$velocityX vy=$velocityY childConsumed=$consumed target=${targetName(target)}",
    )

    if (BuildConfig.RN_NESTED_SCROLL_FLING_SHIM) {
      val started =
        ViewCompat.startNestedScroll(
          target,
          ViewCompat.SCROLL_AXIS_VERTICAL,
          ViewCompat.TYPE_NON_TOUCH,
        )
      log(
        "PROBE_FLING_SESSION_SHIM started=$started target=${targetName(target)}",
      )
    }

    return false
  }

  override fun getNestedScrollAxes(): Int = parentHelper.nestedScrollAxes
}
