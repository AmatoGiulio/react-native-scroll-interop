'use strict';

const SUPPORTED_SCREENS_VERSION = /^4\.26\.\d+$/;
const INTEROP_IMPORT =
  'import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController';
const LOCATOR_IMPORT =
  'import com.reactnativescroll.interop.reactnative.ReactNativeVerticalScrollSourceLocator';
const INTEROP_DEPENDENCY = "    implementation project(':react-native-scroll-interop')";

function assertSupportedReactNativeScreensVersion(version) {
  if (!SUPPORTED_SCREENS_VERSION.test(version)) {
    throw new Error(
      `[react-native-scroll-interop] reactNativeScreensInterop supports react-native-screens 4.26.x; found ${version}. ` +
        'Refusing to patch an unvalidated native screen source.'
    );
  }
}

function replaceExactlyOnce(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(
      `[react-native-scroll-interop] Expected exactly one ${label}; found ${count}. ` +
        'Refusing to patch react-native-screens because its source shape changed.'
    );
  }
  return source.replace(needle, replacement);
}

function patchReactNativeScreensGradle(source) {
  if (source.includes(INTEROP_DEPENDENCY)) return source;

  const anchor = "    implementation 'com.facebook.react:react-native:+'\n";
  return replaceExactlyOnce(
    source,
    anchor,
    `${anchor}${INTEROP_DEPENDENCY}\n`,
    'react-native-screens React Native Gradle dependency anchor'
  );
}

function patchScreen(source) {
  if (source.includes(INTEROP_IMPORT)) {
    const required = [
      LOCATOR_IMPORT,
      'NestedScrollingParent3',
      'ReactNativeNestedScrollParentController(this)',
      'ReactNativeVerticalScrollSourceLocator.findUniqueDescendant(root)',
      'nestedScrollInterop.onOwnerAttached()',
      'nestedScrollInterop.onOwnerDetached()',
      'nestedScrollInterop.onStartNestedScroll(',
      'nestedScrollInterop.onNestedPreScroll(',
      'nestedScrollInterop.onNestedScroll(',
    ];
    for (const needle of required) {
      if (!source.includes(needle)) {
        throw new Error(
          `[react-native-scroll-interop] react-native-screens Screen contains a partial interop patch: missing ${needle}.`
        );
      }
    }
    return source;
  }

  source = replaceExactlyOnce(
    source,
    'import android.view.ViewGroup\n',
    'import android.view.ViewGroup\nimport android.view.ViewTreeObserver\n',
    'Screen ViewGroup import'
  );

  source = replaceExactlyOnce(
    source,
    'import androidx.core.view.children\n',
    'import androidx.core.view.NestedScrollingParent3\nimport androidx.core.view.children\n',
    'Screen AndroidX view imports'
  );

  source = replaceExactlyOnce(
    source,
    'import com.facebook.react.uimanager.events.EventDispatcher\n',
    `import com.facebook.react.uimanager.events.EventDispatcher\n${INTEROP_IMPORT}\n${LOCATOR_IMPORT}\n`,
    'Screen EventDispatcher import'
  );

  source = replaceExactlyOnce(
    source,
    '    ScreenContentWrapper.OnLayoutCallback,\n    FragmentProviding {\n',
    '    ScreenContentWrapper.OnLayoutCallback,\n    FragmentProviding,\n    NestedScrollingParent3 {\n',
    'Screen interface list'
  );

  const ownerFields = `    private val nestedScrollInterop = ReactNativeNestedScrollParentController(this)\n    private var nestedScrollInteropOwnerAttached = false\n    private var nestedScrollInteropWaitingForLayout = false\n    private val nestedScrollInteropLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {\n        if (!isAttachedToWindow || !isNativeStackScreen) {\n            stopWaitingForNestedScrollInteropLayout()\n            return@OnGlobalLayoutListener\n        }\n        if (prepareNestedScrollInterop()) {\n            stopWaitingForNestedScrollInteropLayout()\n        }\n    }\n\n    private fun ensureNestedScrollInteropOwnerAttached() {\n        if (!isAttachedToWindow || !isNativeStackScreen || nestedScrollInteropOwnerAttached) return\n        nestedScrollInterop.onOwnerAttached()\n        nestedScrollInteropOwnerAttached = true\n    }\n\n    private fun prepareNestedScrollInterop(): Boolean {\n        if (!isAttachedToWindow || !isNativeStackScreen) return false\n        val root = contentWrapper ?: this\n        val source = ReactNativeVerticalScrollSourceLocator.findUniqueDescendant(root) ?: return false\n        return nestedScrollInterop.prepareNestedSource(source)\n    }\n\n    private fun requestNestedScrollInteropBinding() {\n        if (!isAttachedToWindow || !isNativeStackScreen) return\n        ensureNestedScrollInteropOwnerAttached()\n        if (prepareNestedScrollInterop()) {\n            stopWaitingForNestedScrollInteropLayout()\n        } else {\n            startWaitingForNestedScrollInteropLayout()\n        }\n    }\n\n    private fun startWaitingForNestedScrollInteropLayout() {\n        if (nestedScrollInteropWaitingForLayout) return\n        val observer = viewTreeObserver\n        if (!observer.isAlive) return\n        observer.addOnGlobalLayoutListener(nestedScrollInteropLayoutListener)\n        nestedScrollInteropWaitingForLayout = true\n    }\n\n    private fun stopWaitingForNestedScrollInteropLayout() {\n        if (!nestedScrollInteropWaitingForLayout) return\n        val observer = viewTreeObserver\n        if (observer.isAlive) observer.removeOnGlobalLayoutListener(nestedScrollInteropLayoutListener)\n        nestedScrollInteropWaitingForLayout = false\n    }\n\n`;

  source = replaceExactlyOnce(
    source,
    '    private val isNativeStackScreen: Boolean\n        get() = container is ScreenStack\n\n    init {\n',
    `    private val isNativeStackScreen: Boolean\n        get() = container is ScreenStack\n\n${ownerFields}    init {\n`,
    'Screen native-stack ownership field'
  );

  source = replaceExactlyOnce(
    source,
    '            updateShadowNodeScreenSize(width, height, t)\n        }\n    }\n\n    internal fun onBottomSheetBehaviorDidLayout',
    '            updateShadowNodeScreenSize(width, height, t)\n        }\n        if (isNativeStackScreen) {\n            requestNestedScrollInteropBinding()\n        }\n    }\n\n    internal fun onBottomSheetBehaviorDidLayout',
    'Screen native-stack onLayout body'
  );

  source = replaceExactlyOnce(
    source,
    '    override fun onAttachedToWindow() {\n        super.onAttachedToWindow()\n\n        // Insets handler for formSheet',
    '    override fun onAttachedToWindow() {\n        super.onAttachedToWindow()\n        requestNestedScrollInteropBinding()\n\n        // Insets handler for formSheet',
    'Screen onAttachedToWindow body'
  );

  const nestedParentBlock = `    override fun onDetachedFromWindow() {\n        stopWaitingForNestedScrollInteropLayout()\n        if (nestedScrollInteropOwnerAttached) {\n            nestedScrollInterop.onOwnerDetached()\n            nestedScrollInteropOwnerAttached = false\n        }\n        super.onDetachedFromWindow()\n    }\n\n    // region React Native nested-scroll interop\n\n    override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =\n        nestedScrollInterop.onStartNestedScroll(child, target, axes)\n\n    override fun onNestedScrollAccepted(child: View, target: View, axes: Int) =\n        nestedScrollInterop.onNestedScrollAccepted(child, target, axes)\n\n    override fun onStopNestedScroll(target: View) = nestedScrollInterop.onStopNestedScroll(target)\n\n    override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =\n        nestedScrollInterop.onNestedPreScroll(target, dx, dy, consumed)\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n    )\n\n    override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean =\n        nestedScrollInterop.onNestedPreFling(target, velocityX, velocityY)\n\n    override fun onNestedFling(\n        target: View,\n        velocityX: Float,\n        velocityY: Float,\n        consumed: Boolean,\n    ): Boolean = nestedScrollInterop.onNestedFling(target, velocityX, velocityY, consumed)\n\n    override fun getNestedScrollAxes(): Int = nestedScrollInterop.getNestedScrollAxes()\n\n    override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean =\n        nestedScrollInterop.onStartNestedScroll(child, target, axes, type)\n\n    override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) =\n        nestedScrollInterop.onNestedScrollAccepted(child, target, axes, type)\n\n    override fun onStopNestedScroll(target: View, type: Int) =\n        nestedScrollInterop.onStopNestedScroll(target, type)\n\n    override fun onNestedPreScroll(\n        target: View,\n        dx: Int,\n        dy: Int,\n        consumed: IntArray,\n        type: Int,\n    ) = nestedScrollInterop.onNestedPreScroll(target, dx, dy, consumed, type)\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n        type: Int,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n        type,\n    )\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n        type: Int,\n        consumed: IntArray,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n        type,\n        consumed,\n    )\n\n    // endregion\n\n`;

  source = replaceExactlyOnce(
    source,
    '    private fun dispatchSheetDetentChanged(\n',
    `${nestedParentBlock}    private fun dispatchSheetDetentChanged(\n`,
    'Screen post-attach lifecycle boundary'
  );

  return source;
}

module.exports = {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchScreen,
};
