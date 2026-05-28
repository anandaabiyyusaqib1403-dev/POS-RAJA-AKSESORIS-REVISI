PDA Debugging Guide — Raja Aksesoris POS

Purpose
- Steps to diagnose and gather logs when the POS shows a blank white screen on PDA or embedded WebView.

Quick checklist
- Open the app on the PDA and reproduce the blank white screen.
- If you see the message "Perangkat tidak didukung" the WebView does not support ES modules — use a modern browser or an updated WebView.
- Capture screenshots and console logs (instructions below).

Reproduce locally
1. Start dev server (make it reachable from the device):

```bash
npm run dev --host
```

2. Build and serve production static files:

```bash
npm run build
npx serve dist -p 8080
```

Remote debugging — Android (Chrome)
1. Enable Developer Options and USB debugging on the device.
2. Connect device via USB to your Windows machine.
3. Confirm device connected:

```powershell
adb devices
```

4. Open Chrome on your desktop and visit `chrome://inspect` → "Devices" → locate the WebView or page and click "inspect" to open DevTools for that WebView.
5. If WebView isn't visible: ensure the host app enables WebView debugging (Android: WebView.setWebContentsDebuggingEnabled(true) in the embedding app).

Collecting logs (adb)
- Capture live logs (Windows PowerShell):

```powershell
adb logcat | findstr /i "Chromium WebView console error"
```

- Dump full logs to a file:

```powershell
adb logcat -d > adb_log.txt
```

- If you need to filter for runtime JS errors, look for lines referencing `Chromium`, `WebView`, `Console` or `V8`.

Remote debugging — network (if using Wi‑Fi)
- Connect ADB over TCP/IP (device and host on same network):

```bash
adb tcpip 5555
adb connect DEVICE_IP:5555
```

- Then use `chrome://inspect` as above.

Remote debugging — iOS (Safari)
- On macOS, connect the device, enable Web Inspector in Settings → Safari → Advanced, then open Safari → Develop → <device> to inspect the WebView.
- (If you only have Windows, you will need a mac or a colleague with macOS to run Safari Web Inspector.)

Common checks in DevTools
- Console errors: look for syntax errors, failed module imports, MIME type errors, or blocked scripts.
- Network tab: ensure `index.html` and JS bundles load (HTTP 200). Look for 404, 403, or blocked-by-csp errors.
- Check `navigator.userAgent` to identify the WebView and its engine/version.
- Run this snippet in console to check the root node exists:

```javascript
console.log('root element present:', !!document.getElementById('root'));
```

HMR / Dev server issues
- Some embedded WebViews block WebSocket connections used by Vite HMR which can cause the app to fail to initialize. If remote HMR appears to cause issues, serve the production build (`npx serve dist`) and test again.
- Make sure the device can reach your dev server address (use the machine IP and `--host`).

Module support / nomodule fallback
- If the device does not support ES module scripts, the `nomodule` fallback added to `index.html` will show a message. If you see the fallback content, update the device WebView or load via a modern browser.

What to capture and share with support
- Screenshot of the blank screen.
- Full console logs from DevTools (copy the console output).
- `adb_log.txt` produced with `adb logcat -d > adb_log.txt`.
- Network HAR from DevTools (right-click → Save as HAR).
- `navigator.userAgent` string.
- `dist/index.html` (or `index.html` in the built app) header lines showing script tags.
- Steps to reproduce (exact device model, OS version, connection method: USB/Wi‑Fi, whether it's an embedded app or browser).

Quick triage checklist
- Does the fallback message appear? If yes → WebView lacks ES module support.
- Are there JS syntax errors in console (e.g., "Unexpected token" or "import" errors)?
- Are script bundles returning 200 or 4xx/5xx? If 4xx/5xx → network or hosting issue.
- Are WebSocket/HMR connections failing? Try serving static `dist/` and test again.

Advanced capture (optional)
- Full device bugreport (Android):

```powershell
adb bugreport > bugreport.zip
```

- Use a proxy (Charles, Fiddler, mitmproxy) to inspect network traffic if SSL/network problems suspected.

Notes for integrators
- If this POS is embedded in a native app (WebView), make sure the embedder has enabled WebView debugging during development.
- For older PDAs with legacy WebViews, consider packaging a compatible browser engine or upgrading the device firmware.

If you prefer, I can add a shorter `README` variant into `src/` or `docs/`. I can also add a simple troubleshooting script to capture `navigator.userAgent` and show it on the fallback page.
