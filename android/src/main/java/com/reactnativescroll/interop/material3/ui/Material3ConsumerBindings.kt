package com.reactnativescroll.interop.material3.ui

import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.core.graphics.Insets
import com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer

/**
 * View-environment binding for the Material3 FloatingToolbar consumer.
 *
 * The Material3 consumer owns only Material behavior and transaction state. Placement/insets stay
 * in this UI layer and are supplied through this constructor boundary.
 */
internal class MaterialFloatingToolbarScrollConsumer(
  hostView: ViewGroup,
  composeView: ComposeView,
  visibleFrameInsets: () -> Insets = { Insets.NONE },
) : FloatingToolbarScrollConsumer(
  hostView = hostView,
  composeView = composeView,
  visibleFrameInsets = visibleFrameInsets,
  placementInsets = { NativeFloatingToolbarPlacement.apply(hostView, composeView) },
)
