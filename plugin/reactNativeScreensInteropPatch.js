'use strict';

const SUPPORTED_SCREENS_VERSION = /^4\.26\.\d+$/;
const INTEROP_IMPORT =
  'import com.reactnativescroll.interop.reactnative.ReactNativeNestedScrollParentController';
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

function patchStackScreen(source) {
  if (source.includes(INTEROP_IMPORT)) {
    const required = [
      'NestedScrollingParent3',
      'ReactNativeNestedScrollParentController(this)',
      'nestedScrollInterop.prepareNestedSource(scrollView)',
      'nestedScrollInterop.onOwnerAttached()',
      'nestedScrollInterop.onStartNestedScroll(',
      'nestedScrollInterop.onNestedPreScroll(',
      'nestedScrollInterop.onNestedScroll(',
    ];
    for (const needle of required) {
      if (!source.includes(needle)) {
        throw new Error(
          `[react-native-scroll-interop] react-native-screens StackScreen contains a partial interop patch: missing ${needle}.`
        );
      }
    }
    return source;
  }

  source = replaceExactlyOnce(
    source,
    'import android.view.ViewGroup\n',
    'import android.view.View\nimport android.view.ViewGroup\nimport androidx.core.view.NestedScrollingParent3\n',
    'StackScreen ViewGroup import'
  );

  source = replaceExactlyOnce(
    source,
    'import com.facebook.react.uimanager.ThemedReactContext\n',
    `import com.facebook.react.uimanager.ThemedReactContext\n${INTEROP_IMPORT}\n`,
    'StackScreen ThemedReactContext import'
  );

  source = replaceExactlyOnce(
    source,
    '    ContainerItem {\n',
    '    ContainerItem,\n    NestedScrollingParent3 {\n',
    'StackScreen interface list'
  );

  source = replaceExactlyOnce(
    source,
    '    private val containerItemSupport = ContainerItemSupport()\n',
    '    private val containerItemSupport = ContainerItemSupport()\n' +
      '    private val nestedScrollInterop = ReactNativeNestedScrollParentController(this)\n',
    'StackScreen container support field'
  );

  source = replaceExactlyOnce(
    source,
    '        containerItemSupport.registerScrollView(scrollView)\n        headerConfig?.onContentScrollViewChanged()\n',
    '        containerItemSupport.registerScrollView(scrollView)\n' +
      '        nestedScrollInterop.prepareNestedSource(scrollView)\n' +
      '        headerConfig?.onContentScrollViewChanged()\n',
    'StackScreen scroll-view registration body'
  );

  const nestedParentBlock = `    // region React Native nested-scroll interop\n\n    override fun onAttachedToWindow() {\n        super.onAttachedToWindow()\n        nestedScrollInterop.onOwnerAttached()\n        findContentScrollView()?.let(nestedScrollInterop::prepareNestedSource)\n    }\n\n    override fun onDetachedFromWindow() {\n        nestedScrollInterop.onOwnerDetached()\n        super.onDetachedFromWindow()\n    }\n\n    override fun onStartNestedScroll(child: View, target: View, axes: Int): Boolean =\n        nestedScrollInterop.onStartNestedScroll(child, target, axes)\n\n    override fun onNestedScrollAccepted(child: View, target: View, axes: Int) =\n        nestedScrollInterop.onNestedScrollAccepted(child, target, axes)\n\n    override fun onStopNestedScroll(target: View) = nestedScrollInterop.onStopNestedScroll(target)\n\n    override fun onNestedPreScroll(target: View, dx: Int, dy: Int, consumed: IntArray) =\n        nestedScrollInterop.onNestedPreScroll(target, dx, dy, consumed)\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n    )\n\n    override fun onNestedPreFling(target: View, velocityX: Float, velocityY: Float): Boolean =\n        nestedScrollInterop.onNestedPreFling(target, velocityX, velocityY)\n\n    override fun onNestedFling(\n        target: View,\n        velocityX: Float,\n        velocityY: Float,\n        consumed: Boolean,\n    ): Boolean = nestedScrollInterop.onNestedFling(target, velocityX, velocityY, consumed)\n\n    override fun getNestedScrollAxes(): Int = nestedScrollInterop.getNestedScrollAxes()\n\n    override fun onStartNestedScroll(child: View, target: View, axes: Int, type: Int): Boolean =\n        nestedScrollInterop.onStartNestedScroll(child, target, axes, type)\n\n    override fun onNestedScrollAccepted(child: View, target: View, axes: Int, type: Int) =\n        nestedScrollInterop.onNestedScrollAccepted(child, target, axes, type)\n\n    override fun onStopNestedScroll(target: View, type: Int) =\n        nestedScrollInterop.onStopNestedScroll(target, type)\n\n    override fun onNestedPreScroll(\n        target: View,\n        dx: Int,\n        dy: Int,\n        consumed: IntArray,\n        type: Int,\n    ) = nestedScrollInterop.onNestedPreScroll(target, dx, dy, consumed, type)\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n        type: Int,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n        type,\n    )\n\n    override fun onNestedScroll(\n        target: View,\n        dxConsumed: Int,\n        dyConsumed: Int,\n        dxUnconsumed: Int,\n        dyUnconsumed: Int,\n        type: Int,\n        consumed: IntArray,\n    ) = nestedScrollInterop.onNestedScroll(\n        target,\n        dxConsumed,\n        dyConsumed,\n        dxUnconsumed,\n        dyUnconsumed,\n        type,\n        consumed,\n    )\n\n    // endregion\n\n`;

  source = replaceExactlyOnce(
    source,
    '    // endregion\n\n    internal lateinit var eventEmitter: StackScreenEventEmitter\n',
    `    // endregion\n\n${nestedParentBlock}    internal lateinit var eventEmitter: StackScreenEventEmitter\n`,
    'StackScreen ScrollViewSeeking region boundary'
  );

  return source;
}

module.exports = {
  assertSupportedReactNativeScreensVersion,
  patchReactNativeScreensGradle,
  patchStackScreen,
};
