import { useContext } from "react";
import { DataContext } from "./data-context";

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData harus dipakai di dalam DataProvider.");
  return context;
}
