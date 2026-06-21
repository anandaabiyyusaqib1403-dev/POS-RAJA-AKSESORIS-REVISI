import { createContext } from "react";

export const emptyEmployeePresence = Object.freeze({
  employeeRoster: [],
  refreshEmployeeRoster: async () => [],
});

export const EmployeePresenceContext = createContext(emptyEmployeePresence);
