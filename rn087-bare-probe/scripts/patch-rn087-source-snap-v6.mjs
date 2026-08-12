#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const basePatcher = path.join(root, 'scripts', 'patch-rn087-source-fling.mjs');
const sourcePath = path.join(
  root,
  'node_modules',
  'react-native',
  'ReactAndroid',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'views',
  'scroll',
  'ReactNestedScrollView.kt',
);

// Keep the V5 patcher as the stable causal baseline. V6 layers only the direct snap experiment on
// top, so ordinary fling and the paging animator remain independently diagnosable.
const base = spawnSync(process.execPath, [basePatcher], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (base.error) throw base.error;
if (base.status !== 0) process.exit(base.status ?? 1);

let source = fs.readFileSync(sourcePath, 'utf8');

function replaceOnce(label, from, to) {
  if (!source.includes(from)) {
    console.error(`RN 0.87 snap V6 probe: could not locate ${label}.`);
    process.exit(1);
  }
  source = source.replace(from, to);
}

const fieldAnchor = '  private val nestedSnapPostConsumed = IntArray(2)\n';
replaceOnce(
  'V5 snap state anchor',
  fieldAnchor,
  fieldAnchor +
    '  // V6: direct OverScroller snap is target-locked and emits NON_TOUCH post-scroll only.\n' +
    '  private var nestedDirectSnapActive = false\n' +
    '  private var nestedDirectSnapSessionStarted = false\n' +
    '  private var nestedDirectSnapLastScrollerY = 0\n' +
    '  private var nestedDirectSnapTargetY = 0\n' +
    '  private val nestedDirectSnapPostConsumed = IntArray(2)\n',
);

// Direct snap must keep the exact absolute target selected by RN. A consuming pre-pass shortens the
// child trajectory and RN's later paging settle then has to correct the missing pixels. Start a
// source-owned NON_TOUCH session instead; computeScroll below exposes the real RN child movement in
// the post pass without allowing an ancestor to rewrite the target-locked scroller trajectory.
replaceOnce(
  'V5 direct snap prime',
  '      primeNestedAnimatedScroll(effectiveVelocityY, "snap-direct")\n',
  '      startNestedDirectSnap(targetOffset, effectiveVelocityY)\n',
);

const correctVelocityAnchor = '  private fun correctFlingVelocityY(velocityY: Int): Int {\n';
const directSnapImplementation = `  private fun startNestedDirectSnap(targetY: Int, sourceVelocityY: Int) {
    if (nestedDirectSnapActive) {
      finishNestedDirectSnap("superseded")
    }

    // RN's post-touch runnable intentionally calls flingAndSnap(0) after paging becomes stable.
    // When that pass selects the position the child already occupies, it is a semantic no-op: do
    // not manufacture a second NON_TOUCH transaction (and therefore a second Material settle).
    if (targetY == scrollY && sourceVelocityY == 0) {
      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_DIRECT_SKIP reason=no-op targetY=$targetY sourceVelocityY=$sourceVelocityY " +
              "sourceY=$scrollY",
      )
      return
    }

    nestedDirectSnapLastScrollerY = scrollY
    nestedDirectSnapTargetY = targetY
    nestedDirectSnapSessionStarted =
        startNestedScroll(ViewCompat.SCROLL_AXIS_VERTICAL, ViewCompat.TYPE_NON_TOUCH)
    nestedDirectSnapActive = true

    android.util.Log.i(
        "Rn087NestedScroll",
        "SOURCE_SNAP_DIRECT_START mode=post-only-target-lock targetY=$targetY " +
            "sourceVelocityY=$sourceVelocityY baselineY=$nestedDirectSnapLastScrollerY " +
            "started=$nestedDirectSnapSessionStarted",
    )
  }

  private fun finishNestedDirectSnap(reason: String) {
    if (!nestedDirectSnapActive) return
    val targetY = nestedDirectSnapTargetY
    val sourceY = scrollY
    val currentScroller = scroller
    val scrollerY = currentScroller?.currY ?: sourceY
    val scrollerFinished = currentScroller?.isFinished ?: true
    val sessionStarted = nestedDirectSnapSessionStarted

    nestedDirectSnapActive = false
    nestedDirectSnapSessionStarted = false
    android.util.Log.i(
        "Rn087NestedScroll",
        "SOURCE_SNAP_DIRECT_END reason=$reason targetY=$targetY sourceY=$sourceY " +
            "scrollerY=$scrollerY scrollerFinished=$scrollerFinished",
    )
    if (sessionStarted) {
      stopNestedScroll(ViewCompat.TYPE_NON_TOUCH)
    }
  }

  override fun computeScroll() {
    if (!nestedDirectSnapActive) {
      super.computeScroll()
      return
    }

    val currentScroller = scroller
    if (currentScroller == null) {
      finishNestedDirectSnap("missing-scroller")
      return
    }

    // Always sample currY once before deciding that the animation is over. OverScroller can expose
    // the final coordinate on the call that transitions to finished; returning early here used to
    // leave the RN child a few pixels short of the snap target.
    currentScroller.computeScrollOffset()
    val scrollerY = currentScroller.currY
    val requestedY = scrollerY - nestedDirectSnapLastScrollerY
    nestedDirectSnapLastScrollerY = scrollerY

    if (Build.VERSION.SDK_INT >= 35) {
      setFrameContentVelocity(abs(currentScroller.currVelocity))
    }

    var residualY = 0
    var edgeAbort = false
    if (requestedY != 0) {
      // RN's snap target is a content offset. A nested pre-consumer would shorten the child path,
      // then RN's normal paging settle would issue a second corrective snap. Keep the exact RN
      // OverScroller coordinate for the child and expose that real movement in the post pass.
      val oldScrollY = scrollY
      scrollTo(scrollX, scrollerY)
      val childConsumedY = scrollY - oldScrollY
      val remainingY = requestedY - childConsumedY

      nestedDirectSnapPostConsumed.fill(0)
      if (nestedDirectSnapSessionStarted) {
        dispatchNestedScroll(
            0,
            childConsumedY,
            0,
            remainingY,
            null,
            ViewCompat.TYPE_NON_TOUCH,
            nestedDirectSnapPostConsumed,
        )
      }

      residualY = remainingY - nestedDirectSnapPostConsumed[1]
      edgeAbort = residualY != 0

      android.util.Log.i(
          "Rn087NestedScroll",
          "SOURCE_SNAP_FRAME mode=post-only-target-lock requestedY=$requestedY " +
              "childConsumedY=$childConsumedY remainingY=$remainingY " +
              "parentPostConsumedY=\${nestedDirectSnapPostConsumed[1]} residualY=$residualY " +
              "edgeAbort=$edgeAbort scrollerY=$scrollerY sourceY=$scrollY",
      )
    }

    // The RN snap contract is the child content offset, not OverScroller's temporary overfling
    // coordinate. At an edge, minY=maxY=target and RN deliberately gives the scroller overY, so
    // currY may continue beyond the target after the child is already clamped there. Once the child
    // reaches targetY, the visible snap is complete. Stop the internal scroller and close this one
    // NON_TOUCH transaction instead of waiting for RN's later flingAndSnap(0) pass to supersede it.
    if (scrollY == nestedDirectSnapTargetY) {
      currentScroller.forceFinished(true)
      finishNestedDirectSnap(if (edgeAbort) "target-reached-edge" else "target-reached")
      return
    }

    if (!currentScroller.isFinished) {
      postInvalidateOnAnimation()
    } else {
      finishNestedDirectSnap("finished")
    }
  }

`;
replaceOnce(
  'correctFlingVelocityY insertion point',
  correctVelocityAnchor,
  directSnapImplementation + correctVelocityAnchor,
);

fs.writeFileSync(sourcePath, source);
console.log(
  'RN 0.87 source patch V6: direct snap ends when the RN child reaches its absolute target',
);
