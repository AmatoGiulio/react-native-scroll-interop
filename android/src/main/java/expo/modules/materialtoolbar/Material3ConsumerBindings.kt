package expo.modules.materialtoolbar

import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.core.graphics.Insets

internal typealias TopAppBarScrollConsumer =
  com.reactnativescroll.interop.material3.TopAppBarScrollConsumer

internal typealias TopAppBarInteropMode =
  com.reactnativescroll.interop.material3.TopAppBarInteropMode

/**
 * Expo-side environment binding for the Material3 FloatingToolbar consumer.
 *
 * The Material3 consumer owns only Material behavior and transaction state. Placement/insets stay
 * in the Expo view layer and are supplied through this constructor boundary.
 */
internal class FloatingToolbarScrollConsumer(
  hostView: ViewGroup,
  composeView: ComposeView,
  visibleFrameInsets: () -> Insets = { Insets.NONE },
) : com.reactnativescroll.interop.material3.FloatingToolbarScrollConsumer(
  hostView = hostView,
  composeView = composeView,
  visibleFrameInsets = visibleFrameInsets,
  placementInsets = { NativeFloatingToolbarPlacement.apply(hostView, composeView) },
)
