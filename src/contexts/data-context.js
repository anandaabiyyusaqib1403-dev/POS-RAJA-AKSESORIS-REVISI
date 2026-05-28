import { createContext } from "react";

const DATA_CONTEXT_KEY = "__RAJA_AKSESORIS_DATA_CONTEXT__";

export const DataContext =
  typeof globalThis !== "undefined" && import.meta.env.DEV
    ? (globalThis[DATA_CONTEXT_KEY] ||= createContext(null))
    : createContext(null);
