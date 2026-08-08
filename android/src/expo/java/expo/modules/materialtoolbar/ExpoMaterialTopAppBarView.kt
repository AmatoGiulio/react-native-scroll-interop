package expo.modules.materialtoolbar

import android.content.Context
import android.view.View
import android.view.ViewGroup
import com.facebook.react.uimanager.PointerEvents
import com.facebook.react.uimanager.ReactPointerEventsView
import com.materialtoolbar.views.MaterialTopAppBarHostView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Expo Modules binding for the Material 3 top app bar. See [ExpoMaterialToolbarView]. */
class ExpoMaterialTopAppBarView(
  context: Context,
  appContext: AppContext,
) : ExpoView(context, appContext), ReactPointerEventsView {

  override val pointerEvents: PointerEvents
    get() = PointerEvents.BOX_NONE

  internal val host = MaterialTopAppBarHostView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    )
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
