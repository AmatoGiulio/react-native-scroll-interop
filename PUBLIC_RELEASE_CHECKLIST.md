# Public alpha checklist

This file is intentionally temporary and should be removed before the public alpha is published.

- [ ] Merge public documentation hardening.
- [ ] Run `npm run check` on the documentation-frozen `main` commit.
- [ ] Run `npm pack --dry-run`.
- [ ] Run `npm publish --dry-run --access public --tag next`.
- [ ] Inspect the tarball surface.
- [ ] Publish `0.1.0-alpha.1` under `next`.
- [ ] Verify npm dist-tags.
- [ ] Install the registry artifact in a fresh Android consumer.
- [ ] Remove this temporary checklist after the registry smoke test; keep the durable release policy in `RELEASE.md`.
