import { TransactionDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useTransactions() {
  return useDomainContext(TransactionDataContext, "useTransactions");
}

