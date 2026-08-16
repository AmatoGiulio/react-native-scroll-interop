# What was built

Status date: 2026-08-16

This repository started as a Material 3 toolbar module, but the reusable result is broader: a native Android scroll-interoperability primitive for React Native.

The product boundary is intentionally independent of Expo and Material 3.

## The primitive

The core invariant is:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native consumers
```

React Native remains the sole owner of:

- touch gesture handling;
- fling initiation and fling physics;
- child movement;
- child scroll position.

Native Android consumers participate in the exact nested-scroll transaction produced by that source. They do not reconstruct motion from `scrollY`, do not receive per-frame JS events, do not run a second `OverScroller`, and do not issue `scrollBy` / `scrollTo` commands to reconcile the React Native child.

For each vertical movement the accounting model is:

```text
requested = nativePre + childConsumed + nativePost + remaining
```

Every term belongs to the same synchronous Android transaction.

## Product layers

The implementation should be understood as four separate layers.

### 1. Native scroll core

This layer is neutral. It is neither Expo-specific nor Material-specific.

Current core responsibilities are represented by:

```text
VerticalNestedScrollTransactionDispatcher
SourceScopedNestedScrollLifecycle
NestedScrollConservationLedger
```

The host that receives Android nested-scroll callbacks also belongs conceptually to this layer. Its current implementation name is `ExpoNestedScrollHostView`, but that name reflects where the prototype was born, not what the primitive is.

The target neutral name is:

```text
ReactNativeNestedScrollHostView
```

The core must not know about Material 3 behavior, Expo module registration, or a specific toolbar product.

### 2. React Native source adapter

This layer binds the neutral core to the actual React Native vertical source and treats the source opened by Android's nested-scroll callback as authoritative.

Current implementation:

```text
ReactVerticalScrollSourceInterop
```

Its responsibility is source identity and React Native-specific interop. It does not own a second scroll model.

### 3. Material 3 consumers

Material 3 is the first real consumer family proving that the core can drive multiple native components from one source transaction.

Current consumers include:

```text
TopAppBarScrollConsumer
FloatingToolbarScrollConsumer
```

The TopAppBar may participate in pre/post consumption according to Material behavior. The FloatingToolbar observes/participates in the post phase without becoming the owner of list movement.

Material 3 demonstrates the primitive; it does not define the primitive.

Future native consumers can use the same transaction without changing React Native scroll physics.

### 4. Expo adapter / packaging

Expo is only the module registration/configuration layer used by the current package.

Names such as:

```text
ExpoMaterialToolbarModule
ExpoMaterialTopAppBarModule
```

belong here.

Expo should not appear in the neutral scroll-core naming merely because the prototype currently ships through an Expo native module.

## What has been proven

### RN 0.86.2 fresh consumer

The frozen fresh-consumer checkpoint is:

```text
expo86-androidx-fresh-consumer-pass
5db757d66e5442bc5b44afc42bc58ae09a3185c4
```

Validated locally in a fresh external Expo consumer:

```text
npm package / tarball         PASS
Expo config plugin            PASS
prebuild --clean              PASS
RN source build               PASS
ReactNestedScrollView         PASS
Android build/install         PASS
TopAppBar                     PASS
FloatingToolbar               PASS
NON_TOUCH behavior            PASS
fresh project isolation       PASS
```

The separate clean-remote-machine gate remains open and must not be silently promoted to PASS until it is actually observed.

### RN 0.87+ architecture

The RN 0.87 line has frozen checkpoints for:

- multi-consumer behavior;
- source-boundary ownership;
- shared conservation ledger;
- shared kernel/dispatcher extraction;
- source-scoped lifecycle;
- production hardening.

The measured multi-consumer evidence demonstrates that one React Native source transaction can feed TopAppBar and FloatingToolbar behavior without a second momentum model.

## React Native compatibility boundary

The current React Native source boundary has one specific requirement: ordinary AndroidX `ReactNestedScrollView` flings must preserve the `TYPE_NON_TOUCH` nested-scroll lifecycle while React Native continues to own the fling.

React Native upstream PR `react/react-native#57972` proposes exactly that narrow source fix. It changes the generated ordinary non-paging nested fling path to delegate to AndroidX `super.fling(correctedVelocityY)` while leaving paging/snap behavior on its existing path.

The PR is intentionally Material-agnostic and does not contain this library's dispatcher, ledger, host, TopAppBar, FloatingToolbar, or product API.

## If React Native accepts PR #57972

For React Native versions containing the upstream fix:

```text
React Native source
    |
    | native TOUCH + NON_TOUCH transaction
    v
ReactNativeNestedScrollHostView
    |
    v
neutral dispatcher/lifecycle
    |
    +--> Material 3 consumers
    `--> future native consumers
```

The compatibility patch becomes unnecessary for those versions. The core architecture does not change.

Older React Native versions can continue using a version-scoped compatibility patch if we choose to support them.

## If React Native rejects PR #57972

The library remains viable.

The upstream decision changes distribution/maintenance responsibility, not the architecture.

We keep a small version-scoped React Native compatibility layer that:

1. recognizes only explicitly supported React Native versions/source shapes;
2. applies the narrow source correction required to expose the real AndroidX NON_TOUCH lifecycle;
3. validates the expected source shape before modification;
4. fails closed on unknown shapes;
5. remains separate from the neutral scroll core and from Material 3 consumers.

In that model:

```text
supported RN version
        |
        v
versioned compatibility adapter
        |
        v
real Android nested-scroll transaction
        |
        v
neutral scroll core
        |
        +--> Material 3
        `--> other native consumers
```

This is not a React Native fork. It is a narrow compatibility layer owned and tested by this project.

If maintaining that compatibility layer becomes too expensive for a future React Native version, support for that version should fail explicitly rather than introducing heuristic or reconstructed scroll behavior.

## What this library should become

The reusable library is best described as:

> A native Android scroll-interoperability primitive that exposes React Native's real nested-scroll transaction to multiple native UI consumers while keeping React Native as the sole owner of gesture and fling physics.

Material 3 is the first official consumer/adapter family.

Expo is a packaging/registration adapter.

The React Native source patch is a compatibility concern that can shrink or disappear when upstream supplies the required lifecycle natively.

## Naming direction

Core naming should be neutral:

```text
ReactNativeNestedScrollHostView
ReactVerticalScrollSourceInterop
VerticalNestedScrollTransactionDispatcher
SourceScopedNestedScrollLifecycle
NestedScrollConservationLedger
```

Material-specific names remain under the Material adapter:

```text
TopAppBarScrollConsumer
FloatingToolbarScrollConsumer
```

Expo-specific names remain only where Expo actually participates in registration/configuration.

The current code is not renamed on the RN 0.86 gate line while its clean-remote validation is still pending. Structural/package renaming belongs on a separate refactor branch with before/after build and invariant validation.

## Non-negotiable constraints

The product must never regress into:

- parent-owned fling physics;
- sampled `scrollY` momentum reconstruction;
- parent reconciliation of child position;
- per-frame JS scroll transport;
- timer-based motion reconstruction;
- Material-specific logic inside the React Native source compatibility patch;
- Expo-specific naming in the neutral core merely because Expo is the current packaging mechanism.
