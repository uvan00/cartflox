"use client";

import { createContext, useContext, useState } from "react";

interface SidebarContextValue {
    mobileOpen: boolean;
    toggle: () => void;
    close: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
    mobileOpen: false,
    toggle: () => {},
    close: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    return (
        <SidebarContext.Provider value={{
            mobileOpen,
            toggle: () => setMobileOpen(v => !v),
            close: () => setMobileOpen(false),
        }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    return useContext(SidebarContext);
}
