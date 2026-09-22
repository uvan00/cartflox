"use client";

import { createContext, useContext } from "react";
import { DashboardTheme, DASHBOARD_THEMES } from "@/lib/dashboard-themes";

export const DashboardThemeContext = createContext<DashboardTheme>(DASHBOARD_THEMES.dark);

export function useDashboardTheme(): DashboardTheme {
    return useContext(DashboardThemeContext);
}
