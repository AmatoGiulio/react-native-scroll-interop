# React Native source-side proof

This directory contains source-side evidence for the Android nested-scroll requirement. The patches are about React Native exposing movement it already owns; they are not proposals for React Native to know about Material3 or navigation chrome.

## React Native 0.83

`react-scroll-view-momentum-nested-scroll.patch` keeps the existing `ReactScrollView` gesture/fling ownership and makes the movement produced by its own `OverScroller` observable as a normal Android `TYPE_NON_TOUCH` nested-scroll transaction:

```text
RN OverScroller frame
        |
        v
nested pre-scroll
        |
        v
ReactScrollView moves itself by the remainder
        |
        v
nested post-scroll
```

The parent never owns an `OverScroller`, never calls `scrollBy`/`scrollTo` on the source, and never reconstructs momentum from sampled `scrollY`.

React Native 0.83 is still backed by `android.widget.ScrollView`. Its touch loop uses the older post-scroll contract and cannot receive the `NestedScrollingParent3 consumed[]` value after a parent consumes post-scroll distance. The 0.83 patch is therefore intentionally a momentum-only proof, not the long-term Android source shape.

## React Native 0.87

RN 0.87 introduces the feature-flagged `ReactNestedScrollView`, generated from `ReactScrollView.kt` but backed by AndroidX `NestedScrollView`.

The bare probe on 2026-08-12 established:

```text
flag ON, stock ReactNestedScrollView
TOUCH present
NON_TOUCH absent

same source + diagnostic session-start shim
NON_TOUCH present

ReactAndroid built from source, parent shim removed,
ordinary fling delegated to NestedScrollView.fling()
NON_TOUCH present
source patch runtime gate PASS
```

The isolated defect is that the generated nested implementation copies the legacy `fling()` override and directly invokes the reflected `OverScroller`, bypassing AndroidX's fling entry point. AndroidX `NestedScrollView.fling()` starts `TYPE_NON_TOUCH`, initializes its scroller baseline and lets its own `computeScroll()` perform the nested pre/child/post transaction.

Because `ReactNestedScrollView.kt` is generated, an upstream fix should be expressed in `generate-nested-scroll-view.js` and the generated Kotlin output, not as a permanent hand edit to the generated file.

The validated experiment deliberately used `super.fling(correctedVelocityY)` for the ordinary non-paging path. That proves the missing transaction boundary. Before upstreaming, edge/overfling, interruption, paging/snap and momentum-event compatibility still need explicit regression coverage because AndroidX's fling setup is not byte-for-byte identical to the copied legacy scroller setup.

## Compatibility requirements

Any upstream version of the source fix must preserve these invariants:

1. `nestedScrollEnabled` keeps its existing default; no helper silently enables nested scrolling globally.
2. React Native remains the owner of gesture and fling physics.
3. Existing momentum begin/end JS events continue to fire normally.
4. Paging/snap/programmatic scroll paths remain on their intended path or receive explicit equivalent coverage.
5. Parent3 post-consumption is subtracted before edge handling.
6. End-of-fling edge/stretch behavior is accounted for.
7. The screen/parent never owns a second scroller or reconstructs motion from sampled positions.

## Long-term shape

The target is the AndroidX-backed source, not indefinite patching of `android.widget.ScrollView`:

```text
React Native source physics
        |
        v
real synchronous nested-scroll transaction
        |
        v
screen/native ancestor
        |
        +--> pre consumer (collapsing chrome)
        +--> post observer (floating chrome)
```

The parent side of this repository is source-type-neutral: it accepts either supported RN vertical source, but the nested-scroll callback `target` remains transaction authority.
