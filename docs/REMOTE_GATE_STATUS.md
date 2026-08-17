# RN 0.86 clean remote gate status

Status date: 2026-08-17

This document records the final state of the RN 0.86 reproducibility gate. It is separate from the earlier local/fresh-consumer behavioral proof and records the remote closure evidence explicitly.

## Final state

```text
local monorepo        PASS
fresh external app    PASS
clean remote machine  PASS (EAS)
remote APK install    PASS
runtime recheck       PASS
RN upstream PR        OPEN (#57972)
```

The clean-remote gate is closed.

## Successful remote consumer

Repository:

```text
AmatoGiulio/rn086-fresh-consumer
```

Consumer SHA used for the successful EAS build:

```text
e11107ea3a32b6da12ee2659eb57935895e9127a
Enforce RN 0.86 source patch before EAS Gradle
```

The custom EAS profile applies the package compatibility patch before Gradle and asserts:

```text
EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_FLING   exactly 1
EXPO_MATERIAL_TOOLBAR_RN086_ANDROIDX_MANAGER exactly 2
```

It also rejects a remaining RN 0.86 manager feature gate before the release build starts.

The EAS build completed successfully on remote infrastructure. The produced APK was then installed and started in an emulator. The user manually confirmed that the application works correctly, including TopAppBar, FloatingToolbar, and the expected NON_TOUCH scroll behavior.

This closes the reproducibility/industrialization gate that remained after the local monorepo and fresh external consumer proofs.

## Frozen checkpoint

The corresponding immutable repository checkpoint is:

```text
expo86-androidx-clean-remote-pass
e8b27633accb5e2ffaa3d67d421cb5f6f846882a
```

No runtime, scroll-transport, dispatcher, ledger, lifecycle, Material consumer, or RN 0.86 compatibility-plugin behavior was changed to obtain this pass.

The RN 0.86 compatibility line is now frozen for alpha use except for a separately demonstrated release-blocking defect.

## Earlier GitHub Actions attempts

The earlier GitHub Actions clean-machine attempt did **not** reach checkout, install, prebuild, React Native compilation, or Android compilation.

For workflow run `31829786695` / job `94862469166` GitHub reported:

```text
runner_id=0
runner_name=""
steps=[]
```

The check annotation stated that the job was not started because recent account payments failed or the Actions spending limit needed to be increased.

That result remains classified as an **infrastructure/account block**, not a product, source-shape, Gradle, React Native, or scroll-behavior failure. It is superseded as a reproducibility gate by the successful EAS remote build.

## What was proven remotely

The successful path covers the intended normal consumer flow:

```text
fresh remote consumer state      PASS
package/dependency installation  PASS
Expo config-plugin path          PASS
RN 0.86 source patch verification PASS
RN source Android build          PASS
Android release compile/package  PASS
APK production                   PASS
install/start in emulator        PASS
TopAppBar runtime                PASS
FloatingToolbar runtime          PASS
NON_TOUCH runtime                PASS
```

The runtime claims above are limited to the installed remote artifact and the behavior manually exercised after installation. They do not broaden the RN 0.86 claim to paging/snap or other specialized motion paths that were not part of the validated compatibility scope.

## What happens next

The RN 0.86 gate is no longer a blocker. Main development attention can return to the isolated RN 0.87+/neutral-core line while upstream React Native PR `react/react-native#57972` proceeds independently.

Any structural refactor must still preserve the established invariant and must be validated before promotion:

```text
one React Native scroll physics
one synchronous native nested-scroll transaction
N native consumers
```
