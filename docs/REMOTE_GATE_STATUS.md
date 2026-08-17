# RN 0.86 clean remote gate status

Status date: 2026-08-17

This document records the current state of the final RN 0.86 reproducibility gate. It is deliberately separate from behavioral validation: the local monorepo and fresh external consumer proofs remain valid.

## Current state

```text
local monorepo        PASS
fresh external app    PASS
clean remote machine  BLOCKED / NOT EXECUTED
RN upstream PR        OPEN (#57972)
```

The GitHub Actions clean-machine attempt did **not** reach checkout, install, prebuild, React Native compilation, or Android compilation.

For workflow run `31829786695` / job `94862469166` GitHub reported:

```text
runner_id=0
runner_name=""
steps=[]
```

The check annotation states that the job was not started because recent account payments failed or the Actions spending limit needs to be increased.

Therefore this run is classified as an **infrastructure/account gate**, not a product, source-shape, Gradle, React Native, or scroll-behavior failure.

Do not change the scroll architecture or RN 0.86 compatibility patch in response to this result.

## Current remote-consumer head

Repository:

```text
AmatoGiulio/rn086-fresh-consumer
```

Latest inspected head:

```text
e11107ea3a32b6da12ee2659eb57935895e9127a
Enforce RN 0.86 source patch before EAS Gradle
```

That commit changes only the custom EAS build configuration. Before Gradle it explicitly applies the package compatibility patch and asserts:

```text
EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING   exactly 1
EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER exactly 2
```

It also rejects a remaining RN 0.86 manager feature gate before the release build starts.

The EAS configuration therefore contains the intended fail-closed source-patch verification. An actual successful EAS remote build has not yet been observed and must not be recorded as PASS until verified.

## GitHub Actions gate definition

The repository workflow `.github/workflows/rn086-clean-android.yml` supports `workflow_dispatch` and is designed to run on a fresh `ubuntu-latest` runner. Its acceptance path is:

```text
fresh checkout
pinned dependency verification
npm ci
expo prebuild --platform android --clean
RN 0.86 source-patch marker verification
release React Native source build
release APK upload
```

The workflow itself has not yet exercised this path because the runner was never allocated.

## What closes this gate

One clean remote execution must actually enter the build and demonstrate the normal consumer path. At minimum:

```text
package/install              PASS
Expo config plugin           PASS
prebuild --clean             PASS
RN source patch verification PASS
RN source build              PASS
Android compile/package      PASS
```

Runtime TopAppBar / FloatingToolbar / NON_TOUCH behavior remains separately proven by the fresh external local consumer and should be rechecked on the produced remote artifact when practical.

Once a remote run actually succeeds, record the exact consumer SHA and remote run/build identifier, create a new frozen checkpoint in `material3-scroll`, and freeze the RN 0.86 compatibility line.

## What this blocker does not block

The billing/spending-limit failure does not invalidate the architecture and does not prevent work on the isolated neutral-core refactor branch.

The refactor must remain separate from the validated RN 0.86 gate line and must not be promoted back into that line without before/after build and invariant validation.
