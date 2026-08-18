# Shared Android interop sources

This source set contains the Android/RN nested-scroll primitives compiled by both the Expo module and the bare React Native certification host.

## Core

The neutral core lives physically and logically under:

```text
android-shared/src/main/java/com/reactnativescroll/interop/core/
```

Package: `com.reactnativescroll.interop.core`.

It contains:

- `SourceScopedNestedScrollLifecycle`
- `NestedScrollConservationLedger`
- `VerticalNestedScrollTransactionDispatcher`
- `VerticalNestedPreScrollConsumer`
- `VerticalNestedPostScrollConsumer`
- observation-only `VerticalNestedPostScrollObserver`

The core consumes or observes Android's real synchronous nested-scroll transaction. It owns no gesture physics, fling physics, source position, velocity integration, timers, Expo APIs, Material3 behavior, or concrete React Native scroll-view types.

## React Native compatibility boundary

The React Native adapter lives under:

```text
android-shared/src/main/java/com/reactnativescroll/interop/reactnative/
```

Package: `com.reactnativescroll.interop.reactnative`.

It may recognize supported React Native vertical source implementations and version-specific source capabilities. Concrete RN source typing stays behind this boundary and does not leak into the neutral core.

## Ownership invariant

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native chrome consumers
```

The shared source set exists so production and certification hosts compile the same lifecycle, conservation and dispatch implementation.
