import { useContext } from "react";

export function useDomainContext(context, providerName) {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${providerName} harus dipakai di dalam DataProvider.`);
  }
  return value;
}
