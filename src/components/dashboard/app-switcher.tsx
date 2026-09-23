"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Check,
    ChevronsUpDown,
    Plus,
    Zap
} from "lucide-react";
import { Flexbox, Icon } from "@lobehub/ui";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getApplications } from "@/lib/actions/applications";
import { useDashboardTheme } from "./theme-context";

export function AppSwitcher() {
    const [open, setOpen] = useState(false);
    const [apps, setApps] = useState<any[]>([]);
    const [currentApp, setCurrentApp] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const theme = useDashboardTheme();

    useEffect(() => {
        loadApps();
    }, []);

    const loadApps = async () => {
        try {
            const data = await getApplications();
            setApps(data);

            const savedAppId = typeof window !== 'undefined' ? localStorage.getItem('currentAppId') : null;
            const app = data.find((a: any) => a.id === savedAppId) || data[0];

            if (app) {
                setCurrentApp(app);
                if (typeof window !== 'undefined') {
                    localStorage.setItem('currentAppId', app.id);
                    document.cookie = `applicationId=${app.id}; path=/; max-age=31536000`;
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSelect = (app: any) => {
        setCurrentApp(app);
        localStorage.setItem('currentAppId', app.id);
        document.cookie = `applicationId=${app.id}; path=/; max-age=31536000`;
        setOpen(false);
        window.location.reload();
    };

    const handleCreateApp = () => {
        setOpen(false);
        router.push("/applications/new");
    };

    if (isLoading) return (
        <div style={{ height: 40, borderRadius: 10, background: theme.itemHoverBg }} className="animate-pulse" />
    );

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    style={{
                        width: "100%",
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0 10px",
                        background: open ? theme.itemActiveBg : theme.itemHoverBg,
                        border: `1px solid ${open ? theme.border : theme.divider}`,
                        borderRadius: 10,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        outline: "none",
                    }}
                >
                    <Flexbox align="center" gap={8} horizontal style={{ overflow: "hidden" }}>
                        <Flexbox
                            align="center"
                            justify="center"
                            style={{
                                width: 26,
                                height: 26,
                                borderRadius: 7,
                                background: currentApp?.image ? 'transparent' : "#000",
                                flexShrink: 0,
                                overflow: "hidden",
                            }}
                        >
                            {currentApp?.image ? (
                                <img src={currentApp.image} alt={currentApp.name} style={{ width: 26, height: 26, objectFit: "cover", borderRadius: 7 }} />
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 4L8 18H16L14 28L24 14H16L18 4Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round"/>
                                </svg>
                            )}
                        </Flexbox>
                        <Flexbox gap={0} style={{ overflow: "hidden" }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: theme.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {currentApp?.name || "Sélectionner..."}
                            </span>
                        </Flexbox>
                    </Flexbox>
                    <ChevronsUpDown size={13} style={{ color: theme.textDisabled, flexShrink: 0 }} />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                className="w-[260px] p-1.5"
                style={{
                    background: theme.dropdownBg,
                    border: `1px solid ${theme.dropdownBorder}`,
                    borderRadius: 12,
                    boxShadow: theme.dropdownShadow,
                }}
                align="start"
                sideOffset={8}
            >
                <DropdownMenuLabel style={{ padding: "8px 10px 4px", fontSize: 10, fontWeight: 500, color: theme.textDisabled, letterSpacing: 0.5 }}>
                    Espaces
                </DropdownMenuLabel>

                <DropdownMenuGroup className="space-y-0.5">
                    {apps.map((app) => {
                        const isSelected = currentApp?.id === app.id;
                        return (
                            <DropdownMenuItem
                                key={app.id}
                                onClick={() => handleSelect(app)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 10px",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    background: isSelected ? theme.itemActiveBg : "transparent",
                                    color: isSelected ? theme.textPrimary : theme.textMuted,
                                    fontSize: 13,
                                    fontWeight: isSelected ? 500 : 400,
                                    outline: "none",
                                }}
                            >
                                <Flexbox align="center" gap={8} horizontal>
                                    <Flexbox
                                        align="center"
                                        justify="center"
                                        style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 6,
                                            background: app?.image ? 'transparent' : "#000",
                                            flexShrink: 0,
                                            overflow: "hidden",
                                        }}
                                    >
                                        {app?.image ? (
                                            <img src={app.image} alt={app.name} style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 6 }} />
                                        ) : (
                                            <svg width="12" height="12" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M18 4L8 18H16L14 28L24 14H16L18 4Z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round"/>
                                            </svg>
                                        )}
                                    </Flexbox>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{app.name}</span>
                                </Flexbox>
                                {isSelected && <Check size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuGroup>

                <DropdownMenuSeparator style={{ margin: "4px 0", background: theme.divider }} />

                <DropdownMenuItem
                    onClick={handleCreateApp}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 10px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                        color: theme.textMuted,
                        outline: "none",
                    }}
                >
                    <Plus size={14} />
                    Ajouter un espace
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
