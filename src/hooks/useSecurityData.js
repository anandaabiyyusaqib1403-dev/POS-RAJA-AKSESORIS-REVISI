import { SecurityDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useSecurityData() {
  return useDomainContext(SecurityDataContext, "useSecurityData");
}
