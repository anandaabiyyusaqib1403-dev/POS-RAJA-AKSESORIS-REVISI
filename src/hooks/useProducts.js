import { ProductDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useProducts() {
  return useDomainContext(ProductDataContext, "useProducts");
}

