# React Native Android scroll interop architecture

## Product definition

This repository implements a native Android scroll-interoperability primitive that exposes React Native's real nested-scroll transaction to native UI consumers while keeping React Native as the sole owner of gesture and fling physics.

The invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

There is no parent-owned second scroller, no sampled-`scrollY` momentum reconstruction, no timer-driven physics, no per-frame JS transport and no parent call to `scrollBy` / `scrollTo` on the source.

## Transaction model

For one vertical request:

```text
requested
  -> native PRE consumers
  -> React Native source moves its remainder
  -> native POST consumers
  -> native POST observers
  -> remaining
```

Conservation is:

```text
requested = chromePre + childConsumed + chromePost + remaining
```

The Android nested-scroll callback is the clock. Every value comes from the real synchronous transaction; no value is reconstructed from previous frames.

## Layering

### 1. Neutral core

Package:

```text
com.reactnativescroll.interop.core
```

Physical source path:

```text
android-shared/src/main/java/com/reactnativescroll/interop/core/
```

The core contains:

- `SourceScopedNestedScrollLifecycle`
- `NestedScrollConservationLedger`
- `VerticalNestedScrollTransactionDispatcher`
- `VerticalNestedPreScrollConsumer`
- `VerticalNestedPostScrollConsumer`
- `VerticalNestedPostScrollObserver`

The core owns transaction lifecycle, participant fanout and conservation accounting only. It does not depend on Expo, Material3, concrete React Native scroll classes, source position sampling, velocity integration or timers.

### 2. React Native compatibility adapter

Package:

```text
com.reactnativescroll.interop.reactnative
```

Physical source path:

```text
android-shared/src/main/java/com/reactnativescroll/interop/reactnative/
```

`ReactVerticalScrollSourceInterop` is the compatibility boundary for supported RN vertical sources and their capabilities. Concrete RN source typing is confined here.

The adapter does not own motion. It only answers source-capability questions and exposes the narrow source geometry operations required by the current TopAppBar bridge.

### 3. Material3 consumers

Package:

```text
com.reactnativescroll.interop.material3
```

The Material3 layer contains:

- `Material3NestedScrollTransaction`
- `Material3NestedScrollAdapters`
- `TopAppBarScrollConsumer`
- `FloatingToolbarScrollConsumer`

`TopAppBarScrollConsumer` is a PRE/POST participant. It may consume transaction distance while Material changes app-bar state.

`FloatingToolbarScrollConsumer` is observation-only in transaction accounting. It receives the source's real `childConsumedY` in POST and returns no consumed distance.

Material terminal settling does not run a second fling. Fling distance has already arrived frame-by-frame through nested scroll, so terminal Material settle uses zero velocity.

### 4. Expo integration layer

Package:

```text
expo.modules.materialtoolbar
```

This layer owns Expo-specific concerns:

- native module/view registration
- Fabric/native view ownership
- screen-local consumer registry/resolution
- production `ReactNativeNestedScrollHostView`
- FloatingToolbar placement and window-insets binding
- RN 0.86 config-plugin compatibility packaging

`NativeFloatingToolbarPlacement` intentionally stays here because it owns `ExpoMaterialToolbarView` placement/insets state. The Expo-side `FloatingToolbarScrollConsumer` binding is only a constructor/environment adapter over the real Material3 consumer; it injects placement into the Material3 consumer without moving Expo view knowledge into the Material3 layer.

The registered native identity remains compatible with the existing Expo package surface.

## Production host

`ReactNativeNestedScrollHostView` is an Android `NestedScrollingParent3` ancestor. It does not become a scroll container.

Its responsibilities are:

1. accept the source's real Android nested-scroll session;
2. resolve source capabilities through `ReactVerticalScrollSourceInterop`;
3. bind screen-local native chrome consumers;
4. dispatch PRE/POST through `VerticalNestedScrollTransactionDispatcher`;
5. reject stale callbacks and source replacement safely;
6. end Material transactions only when source lifecycle permits it.

The actual nested-scroll target supplied by Android is transaction authority. Pre-gesture tree discovery may prepare geometry and nested-scrolling capability, but it does not grant transaction authority.

## Source-scoped lifecycle

Touch and NON_TOUCH momentum belong to a concrete source View instance.

`SourceScopedNestedScrollLifecycle` tracks:

```text
activeSource
momentumSource
```

If Fabric replaces the source, stale callbacks from the old source fail closed. A TOUCH stop does not end the chrome transaction while the same source still owns NON_TOUCH momentum. Terminal settle occurs when the real momentum session ends.

## TopAppBar behavior

The TopAppBar consumer:

- fails closed until Material has resolved a finite `heightOffsetLimit`;
- consumes real PRE/POST nested-scroll distance;
- clamps reported consumption to available Android distance;
- reports no more distance than the chrome actually moved;
- keeps React Native as source-position owner;
- uses the RN compatibility adapter only for the current scroll-away geometry primitive;
- never runs child scroll physics.

The visual source-content translation used by the standalone Expo integration is geometry, not scrolling. It is not part of transaction conservation.

## FloatingToolbar behavior

The FloatingToolbar consumer:

- observes real `childConsumedY` in POST;
- maps TOUCH to Material `UserInput` and NON_TOUCH to `SideEffect`;
- updates Material offset state and visual translation;
- preserves Material state across host detach/rebind where required by navigation lifecycle;
- consumes zero list distance;
- performs terminal Material settle with zero velocity.

Placement/insets are injected from `NativeFloatingToolbarPlacement` in the Expo integration layer. This keeps Expo view ownership out of the Material3 behavior implementation.

## RN 0.86 compatibility

RN 0.86.x requires a narrow source compatibility patch supplied by the Expo config plugin.

For the ordinary non-paging `ReactNestedScrollView` fling path, the patch delegates to AndroidX `NestedScrollView.fling()` so AndroidX emits the real typed NON_TOUCH nested-scroll lifecycle while React Native still owns fling initiation and physics.

The compatibility patch does not implement chrome behavior, parent physics, sampled motion or a second scroller.

If the equivalent source behavior is available upstream in a future RN version, the version-scoped compatibility patch can shrink or disappear without changing the core transaction architecture.

## What the architecture explicitly forbids

- parent-owned `OverScroller` / `Scroller` for source movement
- parent `scrollBy` / `scrollTo` on the React Native source
- sampled `scrollY` as a transport
- timer-based momentum reconstruction
- custom velocity integration replacing RN physics
- parent-started nested sessions pretending to be source movement
- Material3 knowledge in the neutral core
- Expo Modules APIs in the neutral core or RN compatibility adapter
- concrete RN scroll-view typing outside the RN compatibility boundary
- FloatingToolbar participation as a consuming PRE/POST participant

## Validation model

The repository invariant scripts guard the architecture statically. Runtime certification additionally exercises:

- ordinary touch scroll
- NON_TOUCH fling
- TopAppBar collapse/expand
- FloatingToolbar/FAB behavior
- source replacement/detach
- NativeTabs switch-away/return
- immediate scroll after return
- fling -> tab switch -> return -> new scroll

The RN 0.86 fresh-consumer project is the external packaging/runtime gate; the local example is the package's direct integration smoke test.

## Package identity

The current npm package remains the internal alpha workspace `expo-material-toolbar`. That name is a packaging surface, not the architectural identity of the scroll primitive.

The architecture is intentionally organized so the neutral core, RN adapter and Material3 consumers can be packaged independently later without changing transaction ownership. No public package rename is implied by this document.
