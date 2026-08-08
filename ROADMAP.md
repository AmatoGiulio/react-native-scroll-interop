# Roadmap

## Current alpha.19 checkpoint

- [x] FloatingToolbar native RN scroll consumer
- [x] Generic `NativeScrollConsumer` boundary
- [x] Shared RN native scroll transport / multi-client fan-out
- [x] Second Material3 consumer: `TopAppBarScrollConsumer`
- [ ] Host-app regression matrix for both consumers
- [ ] Replace RN-adapter boundary MotionEvent observer with a screen-owned/marker-owned source primitive before upstream proposal
- [ ] TalkBack/touch-exploration hardening
- [ ] Focused-screen/source ownership hardening
- [ ] Minimal upstream-oriented PoC independent of toolbar product API

# Material Toolbar roadmap

## v2 alpha - implemented in this package

The bridge now targets the public Material 3 Compose floating-toolbar API instead of carrying a custom tab implementation inside a Material container.

Implemented:

- Material 3 `1.5.0-alpha17`.
- `HorizontalFloatingToolbar` and `VerticalFloatingToolbar`.
- Standard and vibrant floating-toolbar colors.
- Native attached FAB using Material floating-toolbar FAB implementations.
- Horizontal FAB position: start/end.
- Vertical FAB position: top/bottom.
- No-FAB `leadingContent`, main `content`, and `trailingContent` slots.
- Native `expanded` behavior.
- Stock Material `IconButton` and `TextButton` actions.
- Removed selected pill and `Role.Tab` semantics.
- Material default content padding, screen offset, elevation and shape/motion behavior unless the bridge explicitly exposes a supported override.
- Native system light/dark mode and Android 12+ dynamic colors.
- React Native color overrides.
- Native safe-drawing insets and alignment.
- Native IME visibility handling.
- Bundled/remote images plus Android drawable/mipmap resources.

## What is deliberately not represented

### Selected navigation state

`FloatingToolbar` is not a tab/navigation item container with selected-item APIs. Navigation state stays in Expo Router / React Navigation. If a route should change the visual icon, React can supply a different icon descriptor when the route changes. The native bridge does not invent a selected pill.

### Arbitrary Compose objects

A JS prop cannot faithfully represent arbitrary Compose `Shape`, `FiniteAnimationSpec`, `MutableInteractionSource`, or a custom composable lambda. The bridge keeps native defaults for these instead of inventing lossy serializations.

### Docked toolbar

Do not add a synthetic `kind="docked"` until there is a public Compose Material 3 toolbar API to map to. A Material Components Views docked toolbar is a different implementation family and would violate the goal of mirroring the Compose API.

## Hide-on-scroll: revised direction

The earlier direct-scroll-target design is not the right default for a toolbar shared by a tab shell. A native view reference can technically point to a sibling view, but the shared toolbar would still need target registration/switching as screens mount, focus, recycle, and change list implementations.

The next experiment should instead observe React Native scroll dispatch natively at the active React surface/root:

1. subscribe on Android to the native RN scroll event dispatcher (before/independent of JS handling);
2. filter events to the toolbar's active surface and ignore stale/inactive screens;
3. derive direction and accumulated distance natively;
4. feed that into the Material floating-toolbar expanded/visibility state;
5. preserve accessibility behavior and avoid per-frame JS work.

This removes the requirement for the toolbar and list to share a Compose tree and avoids passing a scroll ref to the toolbar. It is more coupled to React Native internals, so it must be verified against the exact Expo/RN version used by the host app.

Fallback if RN event-dispatch integration is too unstable: an explicit lightweight native `ScrollSource` registration wrapper/hook per screen that publishes native deltas into a module-level registry. The toolbar subscribes to the registry rather than to a specific child ref.

Avoid using a global `ViewTreeObserver.OnScrollChangedListener` as the primary implementation: it does not identify the scroll source well enough for nested/multiple scrollables.

## Insets / overlay follow-up

Compose can calculate system insets but cannot enlarge Yoga-assigned native bounds. For the shared-navigation case the recommended host is currently a screen-sized absolute overlay. We still need to verify pointer pass-through behavior outside the actual Compose toolbar across the target Expo/RN version.

## Validation still required in the host app

The module archive does not contain the full Expo Android host, so final Gradle dependency resolution and runtime behavior need to be validated with a new development build. In particular:

- Material3 alpha17 + the host's Compose/Kotlin dependency graph;
- safe-area behavior under edge-to-edge;
- pointer routing with `StyleSheet.absoluteFill`;
- image loading for Metro assets in release builds;
- TalkBack semantics;
- horizontal/vertical FAB expansion animations.
