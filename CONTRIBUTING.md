# Contributing

Contributions are welcome, but changes to scroll semantics are held to a high evidence bar because small lifecycle or consumption changes can alter native motion.

## Before changing runtime behavior

Read:

- `ARCHITECTURE.md`;
- `README.md` transaction ownership section;
- `ROADMAP.md` non-goals;
- the invariant checks under `scripts/`.

Runtime changes must preserve:

```text
requested = preConsumed + childConsumed + postConsumed + remaining
```

and must not introduce a second owner for React Native source motion.

## Required checks

Before opening a pull request:

```bash
npm run check
npm pack --dry-run
```

Native/runtime changes also require a fresh Android consumer build and a deterministic runtime reproduction for the affected path.

## Pull requests

Keep changes scoped. Separate architecture/runtime changes from documentation or release housekeeping when possible.

For behavior fixes, include:

- the failing sequence before the change;
- why the existing transaction/lifecycle is wrong;
- the smallest production change that fixes it;
- a regression test or deterministic runtime gate;
- confirmation that touch, fling, reverse direction, and stock/no-consumer behavior remain intact when relevant.

Do not classify infrastructure or instrumentation failures as product regressions without evidence that a test body reached the affected behavior.
