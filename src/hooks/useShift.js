import { ShiftDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useShift() {
  return useDomainContext(ShiftDataContext, "useShift");
}

