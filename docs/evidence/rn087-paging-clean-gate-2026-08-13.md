# RN 0.87 basic paging clean gate — 2026-08-13

Status: **transaction/target PASS; behavioral equivalence OPEN**.

Scenario:

- React Native 0.87.0
- `useNestedScrollViewAndroid=true`
- basic `pagingEnabled` only, no explicit snap interval/offset/alignment
- RN `ValueAnimator` paging path
- real Material3 TopAppBar consumer
- real Material3 FloatingToolbar observer

Validated capture: `/tmp/rn087-bare-on-source-multi-chrome-paging.log`.

## Product-shape transaction evidence

```text
Nested sessions
starts TOUCH / NON_TOUCH    13 / 8
stops  TOUCH / NON_TOUCH    13 / 8

Material3 TopAppBar
movement TOUCH / NON_TOUCH  64 / 0
settle start / end          13 / 13
settle completed/cancelled 13 / 0

Transaction ledger
post-complete frames        187
full-pre TOUCH frames        38
full-pre NON_TOUCH frames     0
complete frames             225
broken complete frames        0
unexpected orphan pre         0

Material3 FloatingToolbar
child movement post T/NT    42 / 120
observed posts T/NT         42 / 120
visual movement T/NT        24 / 44
settle start / end          13 / 13
```

All chrome/ledger gates passed. The TopAppBar had no NON_TOUCH positional change in this particular capture, while the source emitted real NON_TOUCH child movement and the FloatingToolbar observed all 120 non-zero child-consumed post frames.

## Paging animator evidence

```text
paging-animator requests     8
animator starts / ends       8 / 8
animator target matches      8 / 8

NON_TOUCH session balance    PASS
NON_TOUCH frame dispatch     PASS
paging animator path         PASS
snap target accounting       PASS
```

This proves that the patched paging animator reached the exact RN-selected final child target in all 8 clean sessions while exposing a balanced source-owned NON_TOUCH transaction.

## Remaining release gate

Device observation still reports that basic paging can feel like it "pulls upward". Because target accounting is exact, this is not currently explained by lost pixels or a target mismatch. Behavioral equivalence to stock RN remains open and must be decided by an identical source-only A/B:

```bash
npm run android:paging:stock
npm run android:paging:patched
```

Interpretation:

- stock and patched both show the same pull: treat it as RN `pagingEnabled` behavior;
- stock feels normal and patched pulls: the diagnostic ValueAnimator nested integration is behaviorally wrong;
- source-only patched feels normal but multi-chrome patched pulls: isolate the Material/chrome interaction.

Do not summarize this clean gate as "paging production-safe" until that behavioral A/B is resolved.
