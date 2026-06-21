export function getStatusLabel(status) {
  return status === "completed" ? "Completed" : "Draft";
}

export function getStatusClass(status) {
  return status === "completed"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-amber-100 text-amber-800";
}

export function getDifferenceMeta(row) {
  const hasRealStock = row.real_stock !== "" && row.real_stock !== null && row.real_stock !== undefined;
  if (!hasRealStock) {
    return {
      label: "-",
      className: "bg-slate-100 text-slate-500",
    };
  }

  if (row.difference < 0) {
    return {
      label: String(row.difference),
      className: "bg-red-50 text-red-700",
    };
  }

  if (row.difference > 0) {
    return {
      label: `+${row.difference}`,
      className: "bg-emerald-50 text-emerald-700",
    };
  }

  return {
    label: "0",
    className: "bg-slate-100 text-slate-600",
  };
}

export function normalizeDraftRows(items = []) {
  return items.map((item) => ({
    ...item,
    real_stock: item.real_stock === null || item.real_stock === undefined ? "" : item.real_stock,
    note: item.note || "",
  }));
}

export function summarizeRows(rows = []) {
  return rows.reduce(
    (acc, row) => {
      const hasRealStock = row.real_stock !== "" && row.real_stock !== null && row.real_stock !== undefined;
      if (!hasRealStock) return acc;

      acc.checked += 1;
      if (row.difference < 0) {
        acc.minus += Math.abs(row.difference);
        acc.loss += Math.abs(row.difference) * Number(row.cost || 0);
      } else if (row.difference > 0) {
        acc.plus += row.difference;
      }
      return acc;
    },
    { checked: 0, minus: 0, plus: 0, loss: 0 }
  );
}

export function filterRowsBySearch(rows, search) {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return rows;

  return rows.filter((row) => {
    return (
      row.product_name.toLowerCase().includes(keyword) ||
      row.category.toLowerCase().includes(keyword) ||
      (row.product_code || "").toLowerCase().includes(keyword)
    );
  });
}
