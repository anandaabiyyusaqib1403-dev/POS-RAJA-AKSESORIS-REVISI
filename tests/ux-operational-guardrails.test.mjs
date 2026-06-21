import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const digitalPage = readFileSync(new URL("../src/pages/DigitalPage.jsx", import.meta.url), "utf8");
const employeePage = readFileSync(
  new URL("../src/pages/EmployeeManagementPage.jsx", import.meta.url),
  "utf8"
);
const permissionHook = readFileSync(
  new URL("../src/hooks/useEmployeePermissions.js", import.meta.url),
  "utf8"
);
const appShell = readFileSync(new URL("../src/layouts/AppShell.jsx", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const tailwindConfig = readFileSync(new URL("../tailwind.config.js", import.meta.url), "utf8");

function getSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, `Missing marker: ${startMarker}`);
  assert.ok(end > start, `Missing marker: ${endMarker}`);
  return source.slice(start, end);
}

test("digital recent services only advance after a completed sale", () => {
  const addToCart = getSection(digitalPage, "const addToCart", "const handleSearchKeyDown");
  const checkout = getSection(
    digitalPage,
    "const handleCheckout",
    "const handleDirectInputSubmit"
  );

  assert.doesNotMatch(addToCart, /rememberCompletedServices/);
  assert.match(digitalPage, /Produk dari transaksi berhasil/);

  const commitPosition = checkout.indexOf("await createDigitalTransaction");
  const recentPosition = checkout.indexOf("rememberCompletedServices(transactionItems)");
  assert.ok(commitPosition >= 0);
  assert.ok(recentPosition > commitPosition);
});

test("employee permission controls require verified backend state and expose recovery", () => {
  assert.match(permissionHook, /const \[loaded, setLoaded\] = useState\(false\)/);
  assert.match(permissionHook, /setLoaded\(true\)/);
  assert.match(permissionHook, /\n    loaded,\n/);

  assert.match(employeePage, /const permissionDataReady = access\.loaded/);
  assert.match(employeePage, /\{permissionDataReady \? <div className="grid gap-3">/);
  assert.match(employeePage, /onClick=\{\(\) => void access\.refresh\(\)\}/);
  assert.match(employeePage, /onClick=\{\(\) => void activity\.refresh\(\)\}/);
  assert.match(employeePage, /Tidak ada hasil filter/);
  assert.match(employeePage, /Reset filter/);
});

test("application remains light-only without a dark theme toggle or override contract", () => {
  assert.match(globalStyles, /color-scheme:\s*light/);
  assert.doesNotMatch(globalStyles, /data-theme=["']dark["']|color-scheme:\s*dark/);
  assert.doesNotMatch(appShell, /THEME_STORAGE_KEY|setTheme|Tema Gelap|data-theme/);
  assert.doesNotMatch(tailwindConfig, /darkMode/);
});

test("application does not expose global density preference controls", () => {
  assert.doesNotMatch(appShell, /DENSITY_STORAGE_KEY|densityOptions|setDensity|Kepadatan tampilan|data-density/);
  assert.doesNotMatch(globalStyles, /data-density/);
});
