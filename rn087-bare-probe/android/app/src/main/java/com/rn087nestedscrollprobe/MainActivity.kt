package com.rn087nestedscrollprobe

import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "RN087NestedScrollProbe"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    object : DefaultReactActivityDelegate(this, mainComponentName) {
      override fun getLaunchOptions(): Bundle =
        Bundle().apply {
          putString("probeMode", BuildConfig.RN_SCROLL_PROBE_MODE)
        }

      override fun loadApp(appKey: String?) {
        super.loadApp(appKey)
        attachProbeHost()
      }
    }

  private fun attachProbeHost() {
    val content = findViewById<ViewGroup>(android.R.id.content)
    check(content.childCount == 1) {
      "Expected one React root view, found ${content.childCount}"
    }

    val reactRoot = content.getChildAt(0)
    content.removeView(reactRoot)

    val probeHost = NestedScrollProbeLayout(this)
    probeHost.addView(
      reactRoot,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      ),
    )
    setContentView(probeHost)

    Log.i(
      "Rn087NestedScroll",
      "PROBE_HOST attached mode=${BuildConfig.RN_SCROLL_PROBE_MODE} " +
        "root=${reactRoot.javaClass.name}#${Integer.toHexString(System.identityHashCode(reactRoot))}",
    )
  }
}
