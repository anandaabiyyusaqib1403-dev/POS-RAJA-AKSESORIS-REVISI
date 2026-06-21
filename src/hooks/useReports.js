import { ReportDataContext } from "../contexts/domain-data-contexts";
import { useDomainContext } from "./useDomainContext";

export function useReports() {
  return useDomainContext(ReportDataContext, "useReports");
}

