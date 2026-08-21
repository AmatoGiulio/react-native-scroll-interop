## What changed

<!-- Keep the change scoped and describe the production behavior affected. -->

## Why

<!-- Explain the invariant, compatibility gap, or public API need this addresses. -->

## Validation

- [ ] `npm run check`
- [ ] `npm pack --dry-run`
- [ ] Fresh Android consumer build/runtime gate when native/runtime behavior changed
- [ ] Deterministic regression evidence for behavior changes

## Scroll invariants

For runtime changes, confirm as applicable:

- [ ] React Native remains the owner of source touch/fling physics
- [ ] no parent `scrollBy` / `scrollTo` or second source scroller was introduced
- [ ] signed PRE/POST conservation is preserved
- [ ] TOUCH/NON_TOUCH lifecycle remains correct
- [ ] stock/no-consumer behavior remains intact

## Compatibility

<!-- List exact RN / Expo / react-native-screens / Android API versions actually validated. -->
