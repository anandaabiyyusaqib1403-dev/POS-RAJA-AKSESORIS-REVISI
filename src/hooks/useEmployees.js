import { EmployeeDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useEmployees() {
  return useDomainContext(EmployeeDataContext, "useEmployees");
}
