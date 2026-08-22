# Contributing

Contributions are welcome, but changes to scroll semantics are held to a high evidence bar because small lifecycle or consumption changes can alter native motion.

## Before changing runtime behavior

Read:

- [`docs/architecture.md`](../docs/architecture.md);
- the transaction ownership section in [`README.md`](../README.md);
- the non-goals in [`docs/roadmap.md`](../docs/roadmap.md);
- the invariant checks under `scripts/`.

Runtime changes must preserve:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

and must not introduce a second owner for React Native source motion.

## Required checks

```bash
npm run check
npm pack --dry-run
```

Native/runtime changes also require a fresh Android consumer build and a deterministic runtime reproduction for the affected path.

## Pull requests

Keep changes scoped. For behavior fixes, include the failing sequence, why the transaction/lifecycle is wrong, the smallest production change, regression evidence, and confirmation that relevant touch/fling/reverse/stock paths remain intact.

Do not classify infrastructure or instrumentation failures as product regressions without evidence that a test body reached the affected behavior.
