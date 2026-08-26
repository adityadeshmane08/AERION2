# Engine Digital Twin Dashboard — GitHub Pages Edition

This is the free, static edition of the Engine Digital Twin Dashboard. It runs the simulator in the browser, so it needs no server, database, API key, or payment method.

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload the contents of this folder to the repository root.
3. Make sure the repository contains `package.json`, `src/`, and `.github/workflows/deploy.yml` at the top level.
4. Push the files to the `main` branch.
5. In GitHub, open **Settings → Pages**.
6. Under **Build and deployment**, choose **GitHub Actions**.
7. Open the **Actions** tab and wait for **Deploy dashboard to GitHub Pages** to finish.
8. Open the Pages URL shown in **Settings → Pages**.

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