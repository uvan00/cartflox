"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, CheckCheck, CreditCard, Shield, Info, Zap, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useDashboardTheme } from "./theme-context";

type Notification = {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    link?: string | null;
    createdAt: string;
};

function typeIcon(type: string) {
    switch (type) {
        case "payment":  return <CreditCard className="h-3.5 w-3.5" />;
        case "security": return <Shield className="h-3.5 w-3.5" />;
        case "system":   return <Zap className="h-3.5 w-3.5" />;
        default:         return <Info className="h-3.5 w-3.5" />;
    }
}

function typeColor(type: string) {
    switch (type) {
        case "payment":  return { bg: "rgba(99,102,241,0.12)", color: "#818cf8" };
        case "security": return { bg: "rgba(245,158,11,0.12)", color: "#fbbf24" };
        case "system":   return { bg: "rgba(52,211,153,0.12)", color: "#34d399" };
        default:         return { bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
    }
}

function timeAgo(date: string) {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "À l'instant";
    if (m < 60) return `Il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Il y a ${h}h`;
    const d = Math.floor(h / 24);
    return `Il y a ${d}j`;
}

export function NotificationDropdown() {
    const theme = useDashboardTheme();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const r = await fetch("/api/notifications");
            const d = await r.json();
            if (d.notifications) {
                setNotifications(d.notifications);
                setUnreadCount(d.unreadCount ?? 0);
            }
        } catch {}
    }, []);

    // Fetch on mount, every 5 minutes, and only while tab is visible
    useEffect(() => {
        fetchNotifications();
        let interval: ReturnType<typeof setInterval> | null = setInterval(fetchNotifications, 5 * 60 * 1000);

        const handleVisibility = () => {
            if (document.hidden) {
                if (interval) { clearInterval(interval); interval = null; }
            } else {
                fetchNotifications();
                if (!interval) interval = setInterval(fetchNotifications, 5 * 60 * 1000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            if (interval) clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [fetchNotifications]);

    // Close on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const handleOpen = () => {
        setOpen(prev => !prev);
        if (!open) fetchNotifications();
    };

    const markAllRead = async () => {
        await fetch("/api/notifications/read-all", { method: "PATCH" });
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    };

    const markOneRead = async (id: string, link?: string | null) => {
        await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
        if (link) {
            setOpen(false);
            router.push(link);
        }
    };

    return (
        <div className="relative" ref={dropRef}>
            {/* Bell button */}
            <button
                onClick={handleOpen}
                className="relative flex items-center justify-center h-[28.8px] w-[28.8px] rounded transition-colors"
                style={{ color: open ? theme.textPrimary : theme.textMuted, background: open ? theme.itemHoverBg : "transparent" }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = theme.itemHoverBg; }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
                aria-label="Notifications"
            >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span
                        className="absolute top-1 right-1 flex items-center justify-center rounded-full text-white font-bold"
                        style={{
                            background: "#5B8DEF",
                            minWidth: unreadCount > 9 ? 14 : 10,
                            height: unreadCount > 9 ? 14 : 10,
                            fontSize: unreadCount > 9 ? 8 : 0,
                            padding: unreadCount > 9 ? "0 2px" : 0,
                            lineHeight: 1,
                        }}
                    >
                        {unreadCount > 9 ? "9+" : ""}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    className="absolute right-0 top-9 w-80 rounded-xl overflow-hidden z-50"
                    style={{
                        background: theme.dropdownBg,
                        border: `1px solid ${theme.dropdownBorder}`,
                        boxShadow: theme.dropdownShadow,
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3"
                        style={{ borderBottom: `1px solid ${theme.divider}` }}
                    >
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>
                                Notifications
                            </span>
                            {unreadCount > 0 && (
                                <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{ background: "rgba(91,141,239,0.15)", color: "#5B8DEF" }}
                                >
                                    {unreadCount} nouvelle{unreadCount > 1 ? "s" : ""}
                                </span>
                            )}
                        </div>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="flex items-center gap-1 text-[11px] transition-colors"
                                style={{ color: theme.textMuted }}
                                onMouseEnter={e => (e.currentTarget.style.color = theme.textPrimary)}
                                onMouseLeave={e => (e.currentTarget.style.color = theme.textMuted)}
                            >
                                <CheckCheck className="h-3 w-3" />
                                Tout marquer lu
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
                        {notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 gap-2">
                                <Bell className="h-6 w-6" style={{ color: theme.textMuted, opacity: 0.4 }} />
                                <p className="text-[12px]" style={{ color: theme.textMuted }}>Aucune notification</p>
                            </div>
                        ) : (
                            notifications.map(n => {
                                const { bg, color } = typeColor(n.type);
                                return (
                                    <div
                                        key={n.id}
                                        onClick={() => markOneRead(n.id, n.link)}
                                        className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors"
                                        style={{
                                            background: n.read ? "transparent" : `${theme.itemHoverBg}60`,
                                            borderBottom: `1px solid ${theme.divider}`,
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = theme.itemHoverBg)}
                                        onMouseLeave={e => (e.currentTarget.style.background = n.read ? "transparent" : `${theme.itemHoverBg}60`)}
                                    >
                                        {/* Icon */}
                                        <div
                                            className="flex items-center justify-center h-7 w-7 rounded-lg shrink-0 mt-0.5"
                                            style={{ background: bg, color }}
                                        >
                                            {typeIcon(n.type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p
                                                    className="text-[12px] font-medium leading-tight"
                                                    style={{ color: n.read ? theme.textMuted : theme.textPrimary }}
                                                >
                                                    {n.title}
                                                </p>
                                                {!n.read && (
                                                    <span
                                                        className="h-1.5 w-1.5 rounded-full shrink-0 mt-1"
                                                        style={{ background: "#5B8DEF" }}
                                                    />
                                                )}
                                            </div>
                                            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: theme.textMuted }}>
                                                {n.body}
                                            </p>
                                            <p className="text-[10px] mt-1" style={{ color: theme.textMuted, opacity: 0.6 }}>
                                                {timeAgo(n.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
