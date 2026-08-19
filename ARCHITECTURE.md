# React Native Android scroll interop architecture

## Product definition

This repository exposes React Native's real Android nested-scroll transaction to native UI consumers while keeping React Native as the sole owner of gesture handling, source position and fling physics.

The invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native UI consumers
```

There is no parent-owned second scroller, sampled-`scrollY` momentum reconstruction, timer-driven physics, per-frame JS transport, or parent call to `scrollBy` / `scrollTo` on the source.

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

The real Android nested-scroll callback is the clock. Every value comes from the synchronous transaction; no value is reconstructed from previous frames.

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

The core contains transaction lifecycle, conservation accounting and participant fanout:

- `SourceScopedNestedScrollLifecycle`
- `NestedScrollConservationLedger`
- `VerticalNestedScrollTransactionDispatcher`
- PRE/POST consumer and observer interfaces

It does not depend on Expo, Material3, concrete React Native scroll classes, source-position sampling, velocity integration or timers.

### 2. React Native compatibility layer

Package:

```text
com.reactnativescroll.interop.reactnative
```

`ReactVerticalScrollSourceInterop` is the compatibility boundary for supported RN vertical sources and their capabilities. Concrete RN source typing is confined to this layer.

`ReactNativeNestedScrollParentController` is the reusable Android parent controller. Its owner is an existing `ViewGroup`; the controller owns:

- `NestedScrollingParentHelper` bookkeeping;
- source-scoped TOUCH/NON_TOUCH lifecycle;
- screen-local chrome binding;
- PRE/POST dispatch and conservation accounting;
- stale callback/source replacement rejection;
- terminal transaction completion.

It never owns source motion, starts a scroller, samples `scrollY` as transport or mutates source position.

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

`TopAppBarScrollConsumer` is a PRE/POST participant and may consume real transaction distance while Material changes app-bar state.

`FloatingToolbarScrollConsumer` is observation-only. It receives real `childConsumedY` POST distance and consumes zero list distance.

Material terminal settling does not run a second fling. Fling distance has already arrived frame-by-frame through nested scroll, so terminal Material settle uses zero velocity.

### 4. Expo/package integration layer

Package:

```text
expo.modules.materialtoolbar
```

This layer owns:

- Expo module/native-view registration;
- screen-local consumer registry/resolution;
- standalone `ReactNativeNestedScrollHostView` source discovery;
- FloatingToolbar placement and window-insets binding;
- RN 0.86 AndroidX compatibility packaging;
- version-scoped `react-native-screens` integration packaging.

The historical `expo.modules.materialtoolbar` namespace is an implementation compatibility surface, not the npm package identity.

## Navigation-first parent ownership

The preferred navigation path is screen-owned:

```text
Expo Router / React Navigation
          ↓
react-native-screens 4.26.x Screen
          ↓
NestedScrollingParent3
          ↓
ReactNativeNestedScrollParentController
          ↓
plain React Native vertical source
```

The config plugin patches the certified `react-native-screens 4.26.x` native `Screen` source shape so the actual native screen ancestor forwards Android parent callbacks to the reusable controller.

The screen already owns route/content identity and can prepare its known content ScrollView directly. It does not need a JavaScript wrapper around page content.

The integration is version/source-shape scoped and fail-closed. It does not claim arbitrary future `react-native-screens` compatibility.

## Standalone host

`ReactNativeNestedScrollHostView` remains a supported fallback/standalone adapter:

```text
NativeScrollHost
    ↓ source discovery
ReactNativeNestedScrollParentController
    ↓
React Native vertical source
```

The host owns only descendant discovery and callback delegation. Transaction lifecycle/dispatcher state lives in the reusable controller, not in the wrapper.

This preserves one implementation of nested-scroll accounting for both navigation-owned and standalone parent surfaces.

## Source authority

The actual nested-scroll `target` supplied by Android is transaction authority.

Pre-gesture source preparation can enable nested scrolling and prepare Material geometry, but it does not grant authority. The controller resolves the real target again when `onStartNestedScroll` begins a session.

Touch and NON_TOUCH momentum are source-scoped. If Fabric/navigation replaces the source, stale callbacks from the old instance fail closed. A TOUCH stop does not end chrome movement while the same source still owns NON_TOUCH momentum.

## Screen-local chrome binding

`NativeNestedScrollRegistry` resolves native consumers from the real source/screen relationship.

TopAppBar resolution prefers the exact matching `react-native-screens` native Screen ancestor, which prevents outgoing/incoming transition screens from binding each other's route chrome.

FloatingToolbar is allowed to remain navigation-scope/surface-scope chrome so one persistent toolbar can observe whichever screen source is active.

Registry resolution selects participants; it does not transport scroll frames.

## TopAppBar behavior

The TopAppBar consumer:

- fails closed until Material has finite resolved geometry;
- consumes real PRE/POST nested-scroll distance;
- clamps reported consumption to Android's available distance;
- reports no more distance than chrome actually moved;
- keeps React Native as source-position owner;
- never runs child scroll physics.

`placement="header"` is a JavaScript/navigator layout concern; it is not part of the scroll transport.

## FloatingToolbar behavior

The FloatingToolbar consumer:

- observes real `childConsumedY` in POST;
- maps TOUCH to Material `UserInput` and NON_TOUCH to `SideEffect`;
- updates Material offset/visual state;
- preserves state across required navigation detach/rebind cycles;
- consumes zero list distance;
- performs terminal Material settle with zero velocity.

Placement/insets stay in the Expo view layer and are injected into Material behavior.

## RN 0.86 compatibility

RN 0.86.x needs a narrow source compatibility patch supplied by the config plugin.

For the ordinary non-paging `ReactNestedScrollView` fling path, the patch delegates to AndroidX `NestedScrollView.fling()` so AndroidX emits the real typed NON_TOUCH nested-scroll lifecycle while React Native still owns fling initiation and physics.

The patch does not implement chrome behavior, parent physics, sampled motion or a second scroller.

If equivalent source behavior is available upstream in a future RN line, this version-scoped compatibility patch can shrink or disappear without changing transaction ownership.

## Expo Router adapter

`react-native-scroll-interop/router` is a JavaScript adapter, not a navigator.

It delegates to Expo Router's existing `Stack`, preserves its static API, and on Android translates supported native-stack header semantics to `MaterialTopAppBar`. iOS/web preserve the existing Expo Router stack behavior.

The adapter never transports scroll frames and does not create navigation state.

## What the architecture explicitly forbids

- parent-owned `OverScroller` / `Scroller` for source movement
- parent `scrollBy` / `scrollTo` on the React Native source
- sampled `scrollY` as a transport
- timer-based momentum reconstruction
- custom velocity integration replacing RN physics
- parent-started fake nested sessions
- Material3 knowledge in the neutral core
- Expo Modules APIs in the neutral core
- concrete RN scroll-view typing outside the RN compatibility boundary
- FloatingToolbar as a consuming PRE/POST participant
- page-level `NativeScrollHost` on the certified screen-owned navigation path
- navigation state duplicated inside the package

## Validation model

Static invariant scripts guard:

- scroll ownership/conservation;
- Material3 adapter boundaries;
- standalone host delegation-only behavior;
- reusable controller ownership;
- navigation API shape;
- RN 0.86 patch shape;
- `react-native-screens 4.26.x` patch shape;
- npm tarball surface.

Runtime certification exercises ordinary touch scroll, NON_TOUCH fling, TopAppBar/FloatingToolbar behavior, navigation push/pop/back, source detach/rebind/replacement and new transactions after navigation changes.

The repository example is the direct integration smoke test. Exact-tarball external consumers remain the release gate.

## Package identity

The public package identity is:

```text
react-native-scroll-interop
```

The neutral core, RN compatibility layer and Material3 consumers remain architecturally separable even though the first alpha ships them in one package.
