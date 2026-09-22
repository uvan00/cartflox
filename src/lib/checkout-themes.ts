export interface CheckoutTheme {
    id: string;
    name: string;
    // Page background
    pageBg: string;
    // Card
    cardBg: string;
    cardBorder: string;
    cardShadow: string;
    // Accent (button, selection, bar top)
    accent: string;
    accentText: string; // text on accent bg
    // Text
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    // Inputs / method cards
    methodBorder: string;
    methodSelectedBorder: string;
    methodSelectedBg: string;
    methodHoverBg: string;
    // Divider
    divider: string;
    // Badge secure
    secureBadgeBg: string;
    secureBadgeText: string;
}

export const CHECKOUT_THEMES: CheckoutTheme[] = [
    {
        // Charte de la page d'accueil cartflox.com : fond clair, cartes
        // blanches a bord fin, bouton noir, badge vert.
        id: 'cartflox',
        name: 'Cartflox (accueil)',
        pageBg: '#F4F4F7',
        cardBg: '#FFFFFF',
        cardBorder: '#E9E9F0',
        cardShadow: '0 12px 40px rgba(26,26,28,0.06)',
        accent: '#1a1a1c',
        accentText: '#ffffff',
        textPrimary: '#1a1a1c',
        textSecondary: '#3f3f46',
        textMuted: '#8a8a93',
        methodBorder: '#E9E9F0',
        methodSelectedBorder: '#1a1a1c',
        methodSelectedBg: '#F4F4F7',
        methodHoverBg: '#F4F4F7',
        divider: '#EEEEF2',
        secureBadgeBg: '#EAF8EF',
        secureBadgeText: '#1f8a4c',
    },
    {
        id: 'light',
        name: 'Clair',
        pageBg: '#F5F5F7',
        cardBg: '#FFFFFF',
        cardBorder: '#E5E7EB',
        cardShadow: '0 8px 40px rgba(0,0,0,0.08)',
        accent: '#10b981',
        accentText: '#ffffff',
        textPrimary: '#111827',
        textSecondary: '#374151',
        textMuted: '#9CA3AF',
        methodBorder: '#E5E7EB',
        methodSelectedBorder: '#10b981',
        methodSelectedBg: '#F0FDF4',
        methodHoverBg: '#F9FAFB',
        divider: '#F3F4F6',
        secureBadgeBg: '#ECFDF5',
        secureBadgeText: '#059669',
    },
    {
        id: 'dark',
        name: 'Sombre',
        pageBg: '#0a0a0b',
        cardBg: '#141414',
        cardBorder: 'rgba(255,255,255,0.07)',
        cardShadow: '0 8px 40px rgba(0,0,0,0.6)',
        accent: '#10b981',
        accentText: '#ffffff',
        textPrimary: '#f9fafb',
        textSecondary: '#d1d5db',
        textMuted: 'rgba(255,255,255,0.35)',
        methodBorder: 'rgba(255,255,255,0.07)',
        methodSelectedBorder: '#10b981',
        methodSelectedBg: 'rgba(16,185,129,0.08)',
        methodHoverBg: 'rgba(255,255,255,0.04)',
        divider: 'rgba(255,255,255,0.06)',
        secureBadgeBg: 'rgba(16,185,129,0.1)',
        secureBadgeText: '#34d399',
    },
    {
        id: 'midnight',
        name: 'Midnight',
        pageBg: '#0f0f1a',
        cardBg: '#1a1a2e',
        cardBorder: 'rgba(99,102,241,0.2)',
        cardShadow: '0 8px 40px rgba(99,102,241,0.15)',
        accent: '#6366f1',
        accentText: '#ffffff',
        textPrimary: '#e0e7ff',
        textSecondary: '#a5b4fc',
        textMuted: 'rgba(165,180,252,0.5)',
        methodBorder: 'rgba(99,102,241,0.15)',
        methodSelectedBorder: '#6366f1',
        methodSelectedBg: 'rgba(99,102,241,0.1)',
        methodHoverBg: 'rgba(99,102,241,0.05)',
        divider: 'rgba(99,102,241,0.1)',
        secureBadgeBg: 'rgba(99,102,241,0.1)',
        secureBadgeText: '#a5b4fc',
    },
    {
        id: 'ocean',
        name: 'Océan',
        pageBg: '#0c1a2e',
        cardBg: '#102540',
        cardBorder: 'rgba(59,130,246,0.2)',
        cardShadow: '0 8px 40px rgba(59,130,246,0.15)',
        accent: '#3b82f6',
        accentText: '#ffffff',
        textPrimary: '#e0f2fe',
        textSecondary: '#7dd3fc',
        textMuted: 'rgba(125,211,252,0.5)',
        methodBorder: 'rgba(59,130,246,0.15)',
        methodSelectedBorder: '#3b82f6',
        methodSelectedBg: 'rgba(59,130,246,0.1)',
        methodHoverBg: 'rgba(59,130,246,0.05)',
        divider: 'rgba(59,130,246,0.1)',
        secureBadgeBg: 'rgba(59,130,246,0.1)',
        secureBadgeText: '#7dd3fc',
    },
    {
        id: 'sunset',
        name: 'Sunset',
        pageBg: '#1a0a0a',
        cardBg: '#1f1010',
        cardBorder: 'rgba(239,68,68,0.2)',
        cardShadow: '0 8px 40px rgba(239,68,68,0.12)',
        accent: '#ef4444',
        accentText: '#ffffff',
        textPrimary: '#fef2f2',
        textSecondary: '#fca5a5',
        textMuted: 'rgba(252,165,165,0.5)',
        methodBorder: 'rgba(239,68,68,0.15)',
        methodSelectedBorder: '#ef4444',
        methodSelectedBg: 'rgba(239,68,68,0.08)',
        methodHoverBg: 'rgba(239,68,68,0.04)',
        divider: 'rgba(239,68,68,0.08)',
        secureBadgeBg: 'rgba(239,68,68,0.08)',
        secureBadgeText: '#fca5a5',
    },
    {
        id: 'gold',
        name: 'Or',
        pageBg: '#0f0d00',
        cardBg: '#1a1800',
        cardBorder: 'rgba(245,158,11,0.25)',
        cardShadow: '0 8px 40px rgba(245,158,11,0.15)',
        accent: '#f59e0b',
        accentText: '#000000',
        textPrimary: '#fefce8',
        textSecondary: '#fde68a',
        textMuted: 'rgba(253,230,138,0.5)',
        methodBorder: 'rgba(245,158,11,0.15)',
        methodSelectedBorder: '#f59e0b',
        methodSelectedBg: 'rgba(245,158,11,0.08)',
        methodHoverBg: 'rgba(245,158,11,0.04)',
        divider: 'rgba(245,158,11,0.08)',
        secureBadgeBg: 'rgba(245,158,11,0.1)',
        secureBadgeText: '#fde68a',
    },
];

export const DEFAULT_THEME = CHECKOUT_THEMES[0];

export function getThemeById(id: string): CheckoutTheme {
    return CHECKOUT_THEMES.find(t => t.id === id) || DEFAULT_THEME;
}
