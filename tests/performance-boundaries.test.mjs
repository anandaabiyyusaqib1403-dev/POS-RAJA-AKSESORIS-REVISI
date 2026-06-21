import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("dashboard renders its shell without statically bundling chart engine", async () => {
  const dashboard = await readSource("src/pages/Dashboard.jsx");
  const chart = await readSource("src/features/dashboard/components/SalesTrendChart.jsx");

  assert.doesNotMatch(dashboard, /from\s+["']recharts["']/);
  assert.match(dashboard, /lazy\(\(\)\s*=>\s*import\(["']\.\.\/features\/dashboard\/components\/SalesTrendChart["']\)\)/);
  assert.match(chart, /from\s+["']recharts["']/);
});

test("route-loaded report modules defer Excel while action modules are imported on demand", async () => {
  const deferredUtilityPaths = [
    "src/utils/salesReportExport.js",
    "src/features/returns/services/returnReports.js",
  ];

  const deferredSources = await Promise.all(deferredUtilityPaths.map(readSource));
  deferredSources.forEach((source, index) => {
    assert.doesNotMatch(source, /import\s+ExcelJS\s+from\s+["']exceljs["']/, deferredUtilityPaths[index]);
    assert.match(source, /loadExcelTools/, deferredUtilityPaths[index]);
  });

  const actionImportContracts = [
    ["src/pages/ProductsPage.jsx", "../utils/productImport"],
    ["src/pages/ServiceProductsPage.jsx", "../utils/serviceImport"],
    ["src/pages/FinanceReportPage.jsx", "../utils/exportFinancialReport"],
    ["src/pages/RiwayatTransaksiPage.jsx", "../utils/transactionExport"],
  ];
  const pageSources = await Promise.all(actionImportContracts.map(([path]) => readSource(path)));
  pageSources.forEach((source, index) => {
    const [, modulePath] = actionImportContracts[index];
    assert.match(source, new RegExp(`import\\(["']${modulePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']\\)`));
  });

  const loader = await readSource("src/utils/loadExcelTools.js");
  assert.match(loader, /import\(["']exceljs["']\)/);
  assert.match(loader, /import\(["']file-saver["']\)/);
});
