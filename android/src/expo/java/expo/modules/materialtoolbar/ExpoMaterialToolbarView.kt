package expo.modules.materialtoolbar

import android.content.Context
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import com.materialtoolbar.views.MaterialToolbarHostView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * Expo Modules binding.
 *
 * Deliberately thin: it adapts Expo's view/event plumbing to [MaterialToolbarHostView] and does
 * nothing else. Every behavioural change belongs in the host or in the interop package, so that
 * the bare React Native binding in `com.materialtoolbar.rn` stays automatically equivalent.
 */
class ExpoMaterialToolbarView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), ReactPointerEventsView {

  override val pointerEvents: PointerEvents
    get() = PointerEvents.BOX_NONE

  private val onActionPress by EventDispatcher()
  private val onFabPress by EventDispatcher()

  internal val host = MaterialToolbarHostView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
    onActionPress = { id -> this@ExpoMaterialToolbarView.onActionPress(mapOf("id" to id)) }
    onFabPress = { this@ExpoMaterialToolbarView.onFabPress(emptyMap<String, Any>()) }
  }

  init {
    isClickable = false
    isFocusable = false
    addView(host)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = View.MeasureSpec.getSize(widthMeasureSpec)
    val height = View.MeasureSpec.getSize(heightMeasureSpec)
    setMeasuredDimension(width, height)
    host.measure(
      View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY),
    )
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    host.layout(0, 0, right - left, bottom - top)
  }
}
