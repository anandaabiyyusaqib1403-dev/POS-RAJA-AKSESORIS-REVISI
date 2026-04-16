import Papa from "papaparse";

const exportCSV = (data) => {
  const csv = Papa.unparse(data);

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "laporan.csv";
  link.click();
};

export { exportCSV };