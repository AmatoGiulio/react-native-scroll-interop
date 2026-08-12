# React Native source-side proof

This directory contains the React Native 0.83 source patch used by the PoC. It is evidence for a source-layer requirement, not a proposal that React Native should know about Material3 or navigation chrome.

## What the patch proves

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

## What it does not solve

React Native 0.83 is backed by `android.widget.ScrollView`. Its touch loop uses the older post-scroll contract and cannot receive the `NestedScrollingParent3 consumed[]` value after a parent consumes post-scroll distance.

The measured top-edge sequence is valid from the parent's point of view:

```text
requested=-48 -> child=-47, chrome=-1
requested=-26 -> child=0,   chrome=-26
```

but in the second frame platform `ScrollView` cannot subtract the parent's `-26` before deciding what remains for edge overscroll. Implementing `NestedScrollingChild3` methods on the subclass does not change that loop; fixing it requires a source implementation that owns the touch loop, such as AndroidX `NestedScrollView`, or an equivalent React Native source change.

So this patch is intentionally **momentum-only proof for the 0.83 source**. It demonstrates why the source must expose the movement it already owns; it is not the final answer for the whole Android nested-scroll contract.

## Compatibility requirements

Any upstream version of this idea must preserve React Native behavior outside an accepted nested-scroll transaction:

1. `nestedScrollEnabled` keeps its existing default. Adding a helper must not silently enable nested scrolling for every ReactScrollView.
2. React Native remains the owner of gesture and fling physics.
3. Existing momentum begin/end JS events continue to fire normally.
4. Paging/snap/programmatic scroll paths must either remain on their existing path or be covered explicitly; they must not accidentally inherit a partial transaction implementation.
5. Parent3 post-consumption must be subtracted before edge handling in a source implementation that claims a complete Child3 contract.
6. End-of-fling edge/stretch behavior must be accounted for. The 0.83 proof cannot reach `ScrollView`'s private glow state, so an accepted nested momentum fling currently ends without the stock terminal stretch/glow.

## Relationship to newer React Native

The architectural target is not to keep patching `android.widget.ScrollView` forever. A source backed by AndroidX `NestedScrollView` already owns both the touch and non-touch nested-scroll loops and is a better long-term shape.

The parent/screen side of this repository is deliberately independent of which source implementation provides the contract. It only expects the real synchronous nested-scroll transaction.
