import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { parseProductWorkbookData } from "../src/utils/productImport.js";

const inputPath = process.argv[2];
const outputPath =
  process.argv[3] || path.resolve("src", "data", "importedProducts.generated.json");

if (!inputPath) {
  console.error("Usage: node scripts/generate-imported-products.mjs <path-to-xlsx> [output-path]");
  process.exit(1);
}

const workbookBuffer = fs.readFileSync(inputPath);
const workbook = XLSX.read(workbookBuffer, {
  type: "buffer",
  cellDates: true,
  raw: true,
});

const { products, summary } = parseProductWorkbookData(workbook);

fs.writeFileSync(outputPath, JSON.stringify(products, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      inputPath: path.resolve(inputPath),
      outputPath: path.resolve(outputPath),
      totalProducts: products.length,
      summary,
    },
    null,
    2
  )
);
