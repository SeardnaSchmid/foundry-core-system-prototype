Rules: Read files first. Write complete solution. Test once. No over-engineering.

## Release Steps
1. Update `system.json` - `version` to new version
2. If updating Foundry compatibility: Update `system.json` - `compatibility.verified` (and optionally `compatibility.minimum`)
3. Update `package.json` - `version` to new version
4. Update `CHANGELOG.md` with changes in this release
5. Commit changes
6. Tag commit: `git tag vX.Y.Z`
7. Push commit and tag: `git push && git push origin vX.Y.Z`
8. GitHub workflow auto-creates release with manifest/zip and updates `download` URL

**Note:** The `download` URL in system.json is auto-updated by the release workflow, no manual change needed.