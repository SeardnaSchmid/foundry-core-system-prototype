Rules: Read files first. Write complete solution. Test once. No over-engineering.

## Release Steps
1. If updating Foundry compatibility: Manually update `system.json` - `compatibility.verified` (and optionally `compatibility.minimum`)
2. Run `npm run release` - This will:
   - Update version in `package.json` and `system.json`
   - Update `CHANGELOG.md` with changes
   - Create commit with message "chore: release vX.Y.Z"
   - Tag commit with `vX.Y.Z`
   - Push commit and tag
3. GitHub workflow auto-creates release with manifest/zip and updates `download` URL

**Note:** The `download` URL in system.json is auto-updated by the release workflow, no manual change needed.