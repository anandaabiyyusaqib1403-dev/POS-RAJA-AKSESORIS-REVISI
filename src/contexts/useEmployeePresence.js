import { useContext } from "react";
import { EmployeePresenceContext, emptyEmployeePresence } from "./employee-presence-context";

export function useEmployeePresence() {
  const context = useContext(EmployeePresenceContext);
  return context || emptyEmployeePresence;
}
