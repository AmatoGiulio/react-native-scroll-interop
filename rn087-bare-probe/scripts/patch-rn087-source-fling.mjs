#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const reactNativeRoot = path.join(root, 'node_modules', 'react-native');
const packagePath = path.join(reactNativeRoot, 'package.json');
const scrollSourceDir = path.join(
  reactNativeRoot,
  'ReactAndroid',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'views',
  'scroll',
);
const sourcePath = path.join(scrollSourceDir, 'ReactNestedScrollView.kt');
const generatorPath = path.join(scrollSourceDir, 'generate-nested-scroll-view.js');

if (!fs.existsSync(packagePath) || !fs.existsSync(sourcePath) || !fs.existsSync(generatorPath)) {
  console.error('RN 0.87 source probe: react-native source tree is missing. Run npm install first.');
  process.exit(1);
}

const reactNativePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (reactNativePackage.version !== '0.87.0') {
  console.error(
    `RN 0.87 source probe: expected react-native 0.87.0, found ${reactNativePackage.version}.`,
  );
  process.exit(1);
}

// ReactNestedScrollView.kt is generated. Always restore the exact RN 0.87 generated baseline first,
// so repeated probe runs and upgrades from older proof patches cannot accumulate source edits.
const generated = spawnSync(process.execPath, [generatorPath], {
  cwd: scrollSourceDir,
  stdio: 'inherit',
  env: process.env,
});
if (generated.error) throw generated.error;
if (generated.status !== 0) process.exit(generated.status ?? 1);

let source = fs.readFileSync(sourcePath, 'utf8');
const marker = 'RN087_NESTED_SCROLL_SOURCE_PATCH_V3';

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    console.error(`RN 0.87 source probe: could not locate ${label}; source no longer matches 0.87.0.`);
    process.exit(1);
  }
  source = source.replace(from, to);
}

const animatorField =
  '  private val defaultFlingAnimator: ValueAnimator = ObjectAnimator.ofInt(this, "scrollY", 0, 0)\n';
replaceOnce(
  'default fling animator field',
  animatorField,
  animatorField +
    `  // ${marker}: state used only while RN's own snap ValueAnimator is active.\n` +
    '  private var nestedSnapAnimatorRequested = false\n' +
    '  private var nestedSnapAnimatorActive = false\n' +
    '  private var nestedSnapAnimatorLastY = 0\n' +
    '  private var nestedSnapAnimatorTargetY = 0\n' +
    '  private val nestedSnapPreConsumed = IntArray(2)\n' +
    '  private val nestedSnapPostConsumed = IntArray(2)\n',
);

const originalFling = `  override fun fling(velocityY: Int) {
    val correctedVelocityY = correctFlingVelocityY(velocityY)

    if (pagingEnabled) {
      flingAndSnap(correctedVelocityY)
    } else if (scroller != null) {
      val scrollWindowHeight = height - paddingBottom - paddingTop
      scroller.fling(
          scrollX, // startX
          scrollY, // startY
          0, // velocityX
          correctedVelocityY, // velocityY
          0, // minX
          0, // maxX
          0, // minY
          Int.MAX_VALUE, // maxY
          0, // overX
          scrollWindowHeight / 2, // overY
      )
      postInvalidateOnAnimation()
    } else {
      super.fling(correctedVelocityY)
    }
    handlePostTouchScrolling(0, correctedVelocityY)
  }
`;

const patchedFling = `  private fun primeNestedAnimatedScroll(velocityY: Int, reason: String) {
    android.util.Log.i(
        "Rn087NestedScroll",
        "SOURCE_NESTED_PRIME reason=$reason velocityY=$velocityY",
    )
    // AndroidX starts TYPE_NON_TOUCH and initializes mLastScrollerY. The caller immediately
    // overwrites the same mScroller before the next frame with RN's original animation parameters.
    super.fling(velocityY)
  }

  private fun startNestedSnapAnimator(targetY: Int) {
    nestedSnapAnimatorRequested = true
    try {
      reactSmoothScrollTo(scrollX, targetY)
    } finally {
      nestedSnapAnimatorRequested = false
    }
  }

  private fun finishNestedSnapAnimator(reason: String) {
    if (!nestedSnapAnimatorActive) return
    val targetY = nestedSnapAnimatorTargetY
    val actualY = scrollY
    nestedSnapAnimatorActive = false
    android.util.Log.i(
        "Rn087NestedScroll",
        "SOURCE_SNAP_ANIMATOR_END reason=$reason targetY=$targetY actualY=$actualY",
    )
    stopNestedScroll(ViewCompat.TYPE_NON_TOUCH)
  }

  override fun fling(velocityY: Int) {
    val correctedVelocityY = correctFlingVelocityY(velocityY)

    if (pagingEnabled) {
      flingAndSnap(correctedVelocityY)
    } else if (scroller != null) {
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_FLING_PATCH mode=prime-then-rn velocityY=$correctedVelocityY",
      )
      primeNestedAnimatedScroll(correctedVelocityY, "ordinary")

      val scrollWindowHeight = height - paddingBottom - paddingTop
      scroller.fling(
          scrollX, // startX
          scrollY, // startY
          0, // velocityX
          correctedVelocityY, // velocityY
          0, // minX
          0, // maxX
          0, // minY
          Int.MAX_VALUE, // maxY
          0, // overX
          scrollWindowHeight / 2, // overY
      )
      postInvalidateOnAnimation()
    } else {
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_FLING_PATCH mode=androidx-fallback velocityY=$correctedVelocityY",
      )
      super.fling(correctedVelocityY)
    }
    handlePostTouchScrolling(0, correctedVelocityY)
  }
`;
replaceOnce('ReactNestedScrollView.fling()', originalFling, patchedFling);

replaceOnce(
  'paging smooth-scroll snap call',
  `    if (finalTargetOffset != currentOffset) {
      activelyScrolling = true
      reactSmoothScrollTo(scrollX, finalTargetOffset.toInt())
    }
`,
  `    if (finalTargetOffset != currentOffset) {
      activelyScrolling = true
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_PATCH mode=paging-animator targetY=\${finalTargetOffset.toInt()} velocityY=$velocity",
      )
      startNestedSnapAnimator(finalTargetOffset.toInt())
    }
`,
);

replaceOnce(
  'flingAndSnap animation branch',
  `    if (hasCustomizedFlingAnimator || scroller == null) {
      reactSmoothScrollTo(scrollX, targetOffset)
    } else {
      activelyScrolling = true
      scroller.fling(
          scrollX, // startX
          scrollY, // startY
          0, // velocityX
          if (velocityY != 0) velocityY else targetOffset - scrollY, // velocityY
          0, // minX
          0, // maxX
          targetOffset, // minY
          targetOffset, // maxY
          0, // overX
          if (targetOffset == 0 || targetOffset == maximumOffset) viewportHeight / 2
          else 0, // overY
      )
      postInvalidateOnAnimation()
    }
`,
  `    if (hasCustomizedFlingAnimator || scroller == null) {
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_PATCH mode=animator-fallback targetY=$targetOffset velocityY=$velocityY",
      )
      startNestedSnapAnimator(targetOffset)
    } else {
      activelyScrolling = true
      val effectiveVelocityY = if (velocityY != 0) velocityY else targetOffset - scrollY
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_PATCH mode=direct-scroller targetY=$targetOffset velocityY=$effectiveVelocityY",
      )
      primeNestedAnimatedScroll(effectiveVelocityY, "snap-direct")
      scroller.fling(
          scrollX, // startX
          scrollY, // startY
          0, // velocityX
          effectiveVelocityY, // velocityY
          0, // minX
          0, // maxX
          targetOffset, // minY
          targetOffset, // maxY
          0, // overX
          if (targetOffset == 0 || targetOffset == maximumOffset) viewportHeight / 2
          else 0, // overY
      )
      postInvalidateOnAnimation()
    }
`,
);

replaceOnce(
  'ReactNestedScrollView.scrollTo()',
  `  override fun scrollTo(x: Int, y: Int) {
    super.scrollTo(x, y)
    ReactScrollViewHelper.updateFabricScrollState(this)
    setPendingContentOffsets(x, y)
  }
`,
  `  override fun scrollTo(x: Int, y: Int) {
    if (nestedSnapAnimatorActive) {
      // ObjectAnimator gives us its own absolute animation coordinate. Convert consecutive animator
      // coordinates to a delta so parent consumption is never re-requested as child "debt".
      val requestedY = y - nestedSnapAnimatorLastY
      nestedSnapAnimatorLastY = y

      if (requestedY != 0) {
        nestedSnapPreConsumed.fill(0)
        dispatchNestedPreScroll(
            0,
            requestedY,
            nestedSnapPreConsumed,
            null,
            ViewCompat.TYPE_NON_TOUCH,
        )

        val remainingY = requestedY - nestedSnapPreConsumed[1]
        val oldScrollY = scrollY
        super.scrollTo(x, oldScrollY + remainingY)
        val childConsumedY = scrollY - oldScrollY
        val unconsumedY = remainingY - childConsumedY

        nestedSnapPostConsumed.fill(0)
        dispatchNestedScroll(
            0,
            childConsumedY,
            0,
            unconsumedY,
            null,
            ViewCompat.TYPE_NON_TOUCH,
            nestedSnapPostConsumed,
        )
      }

      ReactScrollViewHelper.updateFabricScrollState(this)
      setPendingContentOffsets(scrollX, scrollY)
      return
    }

    super.scrollTo(x, y)
    ReactScrollViewHelper.updateFabricScrollState(this)
    setPendingContentOffsets(x, y)
  }
`,
);

replaceOnce(
  'ReactNestedScrollView.startFlingAnimator()',
  `  override fun startFlingAnimator(start: Int, end: Int) {
    defaultFlingAnimator.cancel()
    val duration = ReactScrollViewHelper.getDefaultScrollAnimationDuration(context)
    defaultFlingAnimator.setDuration(duration.toLong()).setIntValues(start, end)
    defaultFlingAnimator.start()

    if (sendMomentumEvents) {
      val yVelocity = if (duration > 0) (end - start) / duration else 0
      ReactScrollViewHelper.emitScrollMomentumBeginEvent(this, 0, yVelocity)
      ReactScrollViewHelper.dispatchMomentumEndOnAnimationEnd(this)
    }
  }
`,
  `  override fun startFlingAnimator(start: Int, end: Int) {
    defaultFlingAnimator.cancel()

    if (nestedSnapAnimatorRequested) {
      nestedSnapAnimatorLastY = start
      nestedSnapAnimatorTargetY = end
      nestedSnapAnimatorActive =
          startNestedScroll(ViewCompat.SCROLL_AXIS_VERTICAL, ViewCompat.TYPE_NON_TOUCH)
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_ANIMATOR_START startY=$start targetY=$end started=$nestedSnapAnimatorActive",
      )

      if (nestedSnapAnimatorActive) {
        defaultFlingAnimator.addListener(
            object : android.animation.Animator.AnimatorListener {
              override fun onAnimationStart(animation: android.animation.Animator) = Unit

              override fun onAnimationEnd(animation: android.animation.Animator) {
                finishNestedSnapAnimator("end")
                animation.removeListener(this)
              }

              override fun onAnimationCancel(animation: android.animation.Animator) {
                finishNestedSnapAnimator("cancel")
              }

              override fun onAnimationRepeat(animation: android.animation.Animator) = Unit
            },
        )
      }
    }

    val duration = ReactScrollViewHelper.getDefaultScrollAnimationDuration(context)
    defaultFlingAnimator.setDuration(duration.toLong()).setIntValues(start, end)
    defaultFlingAnimator.start()

    if (sendMomentumEvents) {
      val yVelocity = if (duration > 0) (end - start) / duration else 0
      ReactScrollViewHelper.emitScrollMomentumBeginEvent(this, 0, yVelocity)
      ReactScrollViewHelper.dispatchMomentumEndOnAnimationEnd(this)
    }
  }
`,
);

fs.writeFileSync(sourcePath, source);

console.log(
  'RN 0.87 source patch v3: ordinary fling + direct snap + RN paging animator emit source-owned NON_TOUCH',
);
