# Engine Digital Twin Dashboard — GitHub Pages Edition

This is the free, static edition of the Engine Digital Twin Dashboard. It runs the simulator in the browser, so it needs no server, database, API key, or payment method.

The ZIP includes both the source app and a prebuilt `docs/` folder. You can deploy it with GitHub Actions or with GitHub's simpler branch-based Pages option.

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload the **contents** of this folder to the repository root. Do not upload the outer folder itself.
3. Push the files to the `main` branch.

### Option A — GitHub Actions

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy dashboard to GitHub Pages** to finish.
4. Open the Pages URL shown in **Settings → Pages**.

### Option B — Deploy without Actions

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and the `/docs` folder.
4. Save, then open the Pages URL shown in **Settings → Pages**.

Use Option B if the Actions workflow does not appear. The `docs/` folder is already a browser-ready production build.

Every push to `main` automatically rebuilds and redeploys the dashboard.

## Run locally

```bash
npm install
npm run dev
```

## Demo behavior

The browser contains a deterministic simulator with:

- Live telemetry polling
- Engine schematic sensor indicators
- Anomaly score and health state
- Remaining useful life gauge
- Soft and hard fault injection
- Reset to nominal operation

Because this version is static, simulator state lives in the browser and resets when the page is reloaded.