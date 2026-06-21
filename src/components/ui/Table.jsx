import { memo, useMemo } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { List } from "react-window";

const Table = ({ children, className = "", wrapperClassName = "" }) => (
  <div className={`brand-scroll-region brand-scrollbar overflow-x-auto ${wrapperClassName}`.trim()}>
    <table className={`brand-table ${className}`.trim()}>
      {children}
    </table>
  </div>
);

const TableHeader = ({ children }) => (
  <thead>
    {children}
  </thead>
);

const TableBody = ({ children }) => (
  <tbody>
    {children}
  </tbody>
);

const TableRow = ({ children, className = "" }) => (
  <tr className={className}>
    {children}
  </tr>
);

const TableHead = ({ children, className = "" }) => (
  <th className={`px-4 py-3 text-left ${className}`.trim()}>
    {children}
  </th>
);

const TableCell = ({ children, className = "", ...props }) => (
  <td className={`px-4 py-3 text-sm text-slate-900 ${className}`.trim()} {...props}>
    {children}
  </td>
);

function useDataTableModel(columns, rows, getRowKey) {
  const tableColumns = useMemo(
    () =>
      columns.map((column) => ({
        id: column.key,
        accessorKey: column.key,
        header: column.header,
        cell: (info) =>
          column.cell ? column.cell(info.row.original, info.row.index) : info.getValue(),
        meta: {
          className: column.className || "",
          headerClassName: column.headerClassName || column.className || "",
        },
      })),
    [columns]
  );

  return useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => String(getRowKey(row, index)),
  });
}

function DataTable({
  columns,
  rows,
  getRowKey = (row) => row.id,
  stickyFirst = false,
  minWidth = "",
  emptyMessage = "Belum ada data.",
  className = "",
  wrapperClassName = "",
}) {
  const tableClassName = [
    stickyFirst ? "brand-table-sticky-first" : "",
    minWidth,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const table = useDataTableModel(columns, rows, getRowKey);

  return (
    <Table className={tableClassName} wrapperClassName={wrapperClassName}>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={header.column.columnDef.meta?.headerClassName || ""}
              >
                {flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cell.column.columnDef.meta?.className || ""}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell className="py-8 text-center" colSpan={columns.length}>
              <span className="text-sm font-semibold text-slate-500">{emptyMessage}</span>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

const VirtualRow = memo(function VirtualRow({ index, rows, style }) {
  const row = rows[index];

  return (
    <div
      className="grid border-b border-[var(--border-muted)] bg-white text-sm text-slate-900 transition hover:bg-[var(--surface-hover)]"
      style={{
        ...style,
        gridTemplateColumns: `repeat(${row.getVisibleCells().length}, minmax(160px, 1fr))`,
      }}
      role="row"
    >
      {row.getVisibleCells().map((cell) => (
        <div
          key={cell.id}
          className={`flex items-center px-4 py-3 ${cell.column.columnDef.meta?.className || ""}`.trim()}
          role="cell"
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
});

function VirtualizedDataTable({
  columns,
  rows,
  getRowKey = (row) => row.id,
  height = 520,
  rowHeight = 58,
  emptyMessage = "Belum ada data.",
  className = "",
}) {
  const table = useDataTableModel(columns, rows, getRowKey);
  const tableRows = table.getRowModel().rows;

  if (!tableRows.length) {
    return (
      <div className="brand-empty-state">
        <p className="text-sm font-semibold text-slate-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-[var(--border-muted)] bg-white shadow-[var(--brand-shadow-soft)] ${className}`.trim()}>
      <div
        className="grid border-b border-[var(--border-muted)] bg-[var(--table-header-bg)] text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(160px, 1fr))` }}
        role="row"
      >
        {table.getHeaderGroups()[0]?.headers.map((header) => (
          <div key={header.id} className="px-4 py-3" role="columnheader">
            {flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>
      <List
        rowCount={tableRows.length}
        rowHeight={rowHeight}
        rowComponent={VirtualRow}
        rowProps={{ rows: tableRows }}
        style={{ height }}
      />
    </div>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  DataTable,
  VirtualizedDataTable,
};
