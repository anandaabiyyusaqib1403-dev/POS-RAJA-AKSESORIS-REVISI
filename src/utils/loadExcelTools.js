let excelToolsPromise;

export function loadExcelTools() {
  if (!excelToolsPromise) {
    excelToolsPromise = Promise.all([import("exceljs"), import("file-saver")]).then(
      ([excelModule, fileSaverModule]) => ({
        ExcelJS: excelModule.default,
        saveAs: fileSaverModule.saveAs,
      })
    );
  }

  return excelToolsPromise;
}
