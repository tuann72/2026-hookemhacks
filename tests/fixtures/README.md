# E2E test fixtures

WebM clips referenced in `manifest.json` are not committed (they're per-developer recordings). Capture them once:

1. `npm run dev`
2. Open `http://localhost:3000/recorder-test`
3. Click **Calibrate guard**, then **Start recording**
4. Throw 3 punches in the first 5s, 1 in the next 5s, 5 in the third — then **Stop**
5. On each chunk row, click **Save fixture** and save into `tests/fixtures/` with the filenames listed in `manifest.json`
6. If your actual punch counts differ from the manifest, edit `manifest.json` to match — the script asserts using the manifest as the source of truth

Once fixtures exist, run `npm run test:e2e` (with `npm run dev` still running in another terminal).
