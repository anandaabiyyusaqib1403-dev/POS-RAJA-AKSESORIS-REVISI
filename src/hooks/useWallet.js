import { WalletDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useWallet() {
  return useDomainContext(WalletDataContext, "useWallet");
}

