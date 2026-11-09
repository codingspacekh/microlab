# Releasing MicroLab

MicroLab's installers and updates work as the gradebook's and OneEditor's do (M11, requirements Rev 13, F-109).
The installers are published as a **GitHub release in a public repo that holds only installers** —
`codingspacekh/microlab-releases` — while the code stays private. Every installed MicroLab looks at that repo's
latest release when it opens and every 6 hours; it says a new version is out, downloads it when asked (or by itself,
if the student turned that on), and puts it in on **Restart and update** or when MicroLab is next closed.

## Once

1. **The releases repo** — public, empty: `codingspacekh/microlab-releases`.
2. **The code repo** — private: `codingspacekh/microlab` (any name); push `main`, `dev` and the tags.
3. **A token for the workflow** — a fine-grained personal access token with *Contents: read and write* on
   `codingspacekh/microlab-releases` only. Save it in the code repo as the Actions secret **`RELEASES_TOKEN`**.
4. **The Mac certificate** — the same self-made code-signing certificate the gradebook and OneEditor use (Keychain
   Access ▸ Certificate Assistant ▸ Create a Certificate…, type *Code Signing*). Name it in
   `~/.microlab/release.env` on the Mac (never in the project):

   ```
   CSC_NAME=ZISPP Gradebook
   ```

   A Mac copy signed with it updates by itself; one that isn't is offered the new `.dmg` in Downloads instead.
5. **`gh`** logged in on the Mac (`gh auth login`).
6. Every computer installs the first version with updates **by hand, once**; after that it updates itself.

## Each version

1. Raise `"version"` in `package.json` (e.g. `0.13.0`), and write what's new for it in `src/main/whats-new.json`
   — short lines a student understands; they are shown in MicroLab after the update. The build refuses a version
   without them.
2. `npm run check` and `npm run e2e` green; merge `dev` into `main`; tag it `v0.13.0`; push the tag.
3. **Windows**: the *Release* workflow makes a **draft** release `v0.13.0` in `microlab-releases` and builds the
   Windows installer into it (with Python 3.13 for Windows; the packaged app checks itself).
4. **Macs**: on the Mac with the certificate, at the tag: `npm run release:mac` builds the Apple-chip and Intel
   installers (each with its own Python, signed with `CSC_NAME`; the Mac's own chip checks itself), merges their
   update feeds into one `latest-mac.yml`, and adds everything to the same draft. `npm run release:mac -- --dry`
   builds only.
5. Look at the draft (`MicroLab-Setup-0.13.0.exe`, the two `.dmg`, their `.zip`, `latest.yml`, `latest-mac.yml`),
   then **publish** it. Every installed MicroLab sees it within 6 hours, or at its next start. A bad release is put
   right by the next one.

## Locally

- `npm run icon` — the app icon (`build/icon.png`) from the logo.
- `npm run fetch:python` — the Python 3.13 and Jedi for this computer (`-- --all`: every platform).
- `npm run dist` — the installer for this computer, unsigned and without updates unless `MICROLAB_UPDATE_URL` and
  `CSC_NAME` are set; `node scripts/package.ts --dir` — the unpacked app only.

## On the computers

- **Windows**: the installer isn't signed — *Windows protected your PC* ▸ **More info** ▸ **Run anyway**. It
  installs for the student alone (no administrator password); the folder can be changed.
- **Mac**: not notarised — the first time, **System Settings ▸ Privacy & Security ▸ Open Anyway**. Apple-chip Macs
  take the `arm64` DMG, Intel Macs the `x64` one.
