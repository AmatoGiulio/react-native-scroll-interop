# RN 0.87 production architecture

Status: hardening starts from the validated multi-consumer baseline (`9dbf12c`, tree-equivalent to `7b9b50f`).

## Non-negotiable invariant

```text
one React Native scroll physics
one Android nested-scroll transaction
N native chrome consumers
```

React Native owns gesture recognition, velocity, fling trajectory, edge effects, interruption and content position. Native chrome may consume or observe the transaction synchronously, but production code must not recreate motion from sampled `scrollY`, start a second `OverScroller`, or drive the source with a second independent animation.

## What is frozen as the behavioral reference

The validated ordinary-scroll baseline contains:

- one RN vertical source;
- balanced TOUCH and NON_TOUCH nested sessions when the source exposes momentum;
- a Material3 TopAppBar consumer;
- a Material3 FloatingToolbar consumer observing the same transaction;
- zero broken transaction-ledger frames in the validated multi-consumer run;
- no JS/per-frame bridge requirement for chrome motion.

The branch `rn087-multi-consumer-baseline` is the behavioral reference. Hardening work must be compared against it before promotion.

## Production transport boundary

Production transport is **source-owned only**.

Accepted source contract:

1. the RN scrolling view owns the actual gesture/fling;
2. TOUCH is dispatched through Android nested scrolling;
3. momentum is dispatched by the same source as TYPE_NON_TOUCH;
4. the parent/host never substitutes its own trajectory;
5. every chrome consumer receives the same transaction in deterministic order.

The historical parent-owned momentum proxy remains useful as a research/control implementation for sources that cannot emit momentum. It is not part of the production architecture and must not silently activate in a production build.

## Consumer roles

### TopAppBar

TopAppBar is allowed to participate in nested pre/post phases according to the real Material3 `TopAppBarScrollBehavior`. It may affect how a transaction is distributed, but it must never generate replacement scroll physics.

### FloatingToolbar

FloatingToolbar is an observation-style consumer for the RN child movement. It receives the child-consumed post-scroll movement and updates the real Material3 `FloatingToolbarScrollBehavior`. It does not alter the parent consumed array and does not own content motion.

### Future consumers

New consumers must implement the same native consumer contract. Adding a consumer must not require modifying the RN source adapter or another consumer.

## Source binding

Production source binding must be deterministic and screen-scoped.

Do not select a source using heuristics such as largest visible ScrollView. The target architecture is for the screen/navigation layer to own the association:

```text
screen
  -> one explicit vertical RN scroll source
  -> one native transaction transport
  -> zero or more native chrome consumers
```

Ambiguity must fail closed.

## RN 0.87 source work

The RN-side problem is narrow: `ReactNestedScrollView` already has AndroidX nested-scroll machinery, but the RN fling override can bypass the AndroidX entry point that opens TYPE_NON_TOUCH momentum.

The upstream/maintained patch must preserve RN behavior while making the source's real momentum transaction observable. The canonical change belongs in the RN nested-scroll-view generator plus regenerated output.

No Material-specific code belongs in the RN patch.

## Explicitly out of scope for the first production milestone

Until ordinary source-owned scrolling is hardened, do not promote experimental handling for:

- `snapToInterval`;
- `snapToOffsets`;
- `pagingEnabled`;
- custom target-locked trajectories;
- parent-owned fling reconstruction.

These remain separate compatibility work. They must not modify or destabilize the ordinary-scroll baseline.

## Hardening phases

### Phase 1 — freeze and isolate

- keep `rn087-multi-consumer-baseline` unchanged;
- perform all new work on `rn087-production-hardening`;
- separate probe-only parent-owned momentum from production source-owned transport;
- add static invariants preventing production code from introducing a second motion owner.

### Phase 2 — deterministic transport

- extract a small source adapter around the Android nested-scroll target;
- remove concrete RN implementation assumptions from consumers;
- make source/chrome binding screen-scoped and fail-closed;
- verify one source fans out to N consumers without duplicate dispatch.

### Phase 3 — lifecycle matrix

Validate on device:

- new touch interrupting momentum;
- immediate reversal;
- top and bottom edges;
- short and high-velocity flings;
- Fabric remount/recycling;
- push/pop and screen transitions;
- multiple screens and multiple scrollables;
- configuration recreation, RTL and font scale;
- release build with tracing disabled.

### Phase 4 — upstream RN patch

Prepare a minimal upstream change and platform-control reproduction using CoordinatorLayout/AppBarLayout. The patch claim should be only that RN momentum participates in the normal Android nested-scroll contract while RN remains the physics owner.

### Phase 5 — public library API

Move source ownership toward the screen/navigation layer. React/React Navigation configure chrome; they do not drive it per frame.

Target shape:

```tsx
<Stack.Screen
  options={{
    topAppBar: {
      variant: 'large',
      scrollBehavior: 'exitUntilCollapsed',
    },
    floatingToolbar: {
      scrollBehavior: 'exitAlways',
    },
  }}
/>
```

The native screen resolves its scroll source and wires the native consumers.

## Promotion rule

No hardening commit is promoted back toward the main development line until both conditions hold:

1. structural gates pass (session balance, ledger conservation, consumer coverage, no second physics owner);
2. ordinary scroll/fling is visually equivalent to the frozen baseline on device.

A numeric PASS cannot override a visible regression.
