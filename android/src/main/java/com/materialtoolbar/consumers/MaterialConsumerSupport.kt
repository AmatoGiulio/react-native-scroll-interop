package com.materialtoolbar.consumers

import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.unit.Velocity
import com.materialtoolbar.interop.NativeScrollFrame
import com.materialtoolbar.interop.ScrollPhase

/**
 * Compose nested-scroll expects to be told whether pixels came from a finger or from inertia.
 * Reporting momentum as [NestedScrollSource.UserInput] makes Material apply drag-time policy to
 * fling pixels, which is a subtle but real behavioural difference from a native Compose screen.
 */
internal fun ScrollPhase.toNestedScrollSource(): NestedScrollSource = when (this) {
  ScrollPhase.Drag -> NestedScrollSource.UserInput
  ScrollPhase.Fling, ScrollPhase.Programmatic -> NestedScrollSource.SideEffect
}

internal val NativeScrollFrame.nestedScrollSource: NestedScrollSource
  get() = phase.toNestedScrollSource()

/**
 * Convert a transport velocity into the sign convention Compose nested scroll uses.
 *
 * Scroll offsets in this bridge are forwarded as `-deltaY` (content moving up is negative), so the
 * velocity handed to Material must use the same axis orientation.
 */
internal fun nestedScrollVelocity(velocityY: Float): Velocity = Velocity(0f, -velocityY)
