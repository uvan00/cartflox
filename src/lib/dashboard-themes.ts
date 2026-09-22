/**
 * Themes du tableau de bord. Palette reprise de Chatwoot (Radix slate, bleu
 * #1F93FF, teal pour les succes) : fonds plats, bordures fines, aucun degrade.
 */
export interface DashboardTheme {
    id: string;
    name: string;
    cssVars: Record<string, string>;
    // Layout backgrounds
    pageBg: string;
    sidebarBg: string;
    headerBg: string;
    cardBg: string;
    cardBgHover: string;
    // Borders / dividers
    border: string;
    divider: string;
    // Text
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textDisabled: string;
    // Interactive
    itemActiveBg: string;
    itemHoverBg: string;
    // Inputs
    inputBg: string;
    inputBorder: string;
    // Dropdown / popover
    dropdownBg: string;
    dropdownBorder: string;
    dropdownShadow: string;
    // Accent (marque) et succes
    accent: string;
    brand: string;
    success: string;
}

const SOMBRE = {
    // Reference Chatwoot : la barre est PLUS SOMBRE que le contenu, les deux
    // plans se distinguent sans bordure marquee, l'actif est une pastille nette.
    pageBg: '#1b1b1d',
    sidebarBg: '#131314',
    headerBg: '#1b1b1d',
    cardBg: '#212123',
    cardBgHover: '#27272a',
    border: 'rgba(255,255,255,0.09)',
    divider: 'rgba(255,255,255,0.06)',
    textPrimary: '#ededef',
    textSecondary: '#b4b4b8',
    textMuted: '#87878d',
    textDisabled: '#55555b',
    itemActiveBg: '#2e2e32',
    itemHoverBg: 'rgba(255,255,255,0.055)',
    inputBg: '#212123',
    inputBorder: 'rgba(255,255,255,0.12)',
    dropdownBg: '#212123',
    dropdownBorder: 'rgba(255,255,255,0.10)',
    dropdownShadow: '0 12px 40px rgba(0,0,0,0.55)',
    brand: '#864FFE',
    primary: '#864FFE',
    success: '#12a594',
    grille: 'rgba(255,255,255,0.06)',
    shadcn: {
        '--background': '#1b1b1d', '--foreground': '#ededef',
        '--card': '#212123', '--card-foreground': '#ededef',
        '--popover': '#212123', '--popover-foreground': '#ededef',
        '--primary': '#864FFE', '--primary-foreground': '#ffffff',
        '--secondary': '#27272a', '--secondary-foreground': '#ededef',
        '--muted': '#27272a', '--muted-foreground': '#87878d',
        '--accent': '#2e2e32', '--accent-foreground': '#ffffff',
        '--border': 'rgba(255,255,255,0.09)', '--input': 'rgba(255,255,255,0.12)', '--ring': '#864FFE',
        // La barre, plus sombre que le contenu ; l'actif en pastille grise nette.
        '--sidebar': '#131314', '--sidebar-foreground': '#b4b4b8',
        '--sidebar-primary': '#2e2e32', '--sidebar-primary-foreground': '#ffffff',
        '--sidebar-accent': 'rgba(255,255,255,0.055)', '--sidebar-accent-foreground': '#ededef',
        '--sidebar-border': 'rgba(255,255,255,0.07)', '--sidebar-ring': '#864FFE',
        '--chart-1': '#864FFE', '--chart-2': '#12a594', '--chart-3': '#38bdf8', '--chart-4': '#fbbf24', '--chart-5': '#f472b6',
    } as Record<string, string>,
};

const CLAIR = {
    // Charte encre, valeurs exactes : barre laterale encre, contenu blanc,
    // gris chaud pour les fonds secondaires, turquoise pour les accents.
    pageBg: '#ffffff',
    sidebarBg: '#221f26',
    headerBg: '#ffffff',
    cardBg: '#ffffff',
    cardBgHover: '#f7f7f7',
    border: '#ecebef',
    divider: '#ecebef',
    textPrimary: '#221f26',
    textSecondary: '#4a4751',
    textMuted: '#6f6c78',
    textDisabled: '#a7a4ae',
    itemActiveBg: '#eef9f9',
    itemHoverBg: '#f7f7f7',
    inputBg: '#ffffff',
    inputBorder: '#d9d7dd',
    dropdownBg: '#ffffff',
    dropdownBorder: '#ecebef',
    dropdownShadow: '0 12px 40px rgba(34,31,38,0.10)',
    // brand = accent des liens et etats actifs (turquoise lisible sur blanc) ;
    // primary = fond des boutons principaux (encre).
    brand: '#2f7d7a',
    primary: '#221f26',
    success: '#12876a',
    grille: 'rgba(34,31,38,0.06)',
    shadcn: {
        '--background': '#ffffff', '--foreground': '#221f26',
        '--card': '#ffffff', '--card-foreground': '#221f26',
        '--popover': '#ffffff', '--popover-foreground': '#221f26',
        '--primary': '#221f26', '--primary-foreground': '#ffffff',
        '--secondary': '#f7f7f7', '--secondary-foreground': '#221f26',
        '--muted': '#f7f7f7', '--muted-foreground': '#6f6c78',
        '--accent': '#eef9f9', '--accent-foreground': '#2f7d7a',
        '--border': '#ecebef', '--input': '#d9d7dd', '--ring': '#66cccc',
        '--sidebar': '#221f26', '--sidebar-foreground': '#e7e6ea',
        '--sidebar-primary': '#66cccc', '--sidebar-primary-foreground': '#221f26',
        '--sidebar-accent': '#34313c', '--sidebar-accent-foreground': '#ffffff',
        '--sidebar-border': 'rgba(255,255,255,0.08)', '--sidebar-ring': '#66cccc',
    } as Record<string, string>,
};

function construire(id: string, name: string, p: typeof SOMBRE | typeof CLAIR): DashboardTheme {
    return {
        id,
        name,
        cssVars: {
            '--dt-page-bg': p.pageBg,
            '--dt-sidebar-bg': p.sidebarBg,
            '--dt-header-bg': p.headerBg,
            '--dt-card-bg': p.cardBg,
            '--dt-card-hover': p.cardBgHover,
            '--dt-border': p.border,
            '--dt-divider': p.divider,
            '--dt-text-primary': p.textPrimary,
            '--dt-text-secondary': p.textSecondary,
            '--dt-text-muted': p.textMuted,
            '--dt-text-disabled': p.textDisabled,
            '--dt-item-active': p.itemActiveBg,
            '--dt-item-hover': p.itemHoverBg,
            '--dt-input-bg': p.inputBg,
            '--dt-input-border': p.inputBorder,
            '--dt-dropdown-bg': p.dropdownBg,
            '--dt-dropdown-border': p.dropdownBorder,
            '--dt-dropdown-shadow': p.dropdownShadow,
            '--dt-brand': p.brand,
            '--dt-primary': p.primary,
            '--dt-success': p.success,
            '--dt-grille': p.grille,
            // Les memes valeurs pour les composants shadcn de la coque.
            '--background': p.pageBg,
            '--foreground': p.textPrimary,
            '--card': p.cardBg,
            '--card-foreground': p.textPrimary,
            '--popover': p.dropdownBg,
            '--popover-foreground': p.textPrimary,
            '--primary': p.brand,
            '--primary-foreground': '#ffffff',
            '--secondary': p.itemHoverBg,
            '--secondary-foreground': p.textPrimary,
            '--muted': p.itemHoverBg,
            '--muted-foreground': p.textMuted,
            '--accent': p.itemActiveBg,
            '--accent-foreground': p.textPrimary,
            '--border': p.border,
            '--input': p.inputBorder,
            '--ring': p.brand,
            '--sidebar': p.sidebarBg,
            '--sidebar-foreground': p.textSecondary,
            '--sidebar-primary': p.brand,
            '--sidebar-primary-foreground': '#ffffff',
            '--sidebar-accent': p.itemActiveBg,
            '--sidebar-accent-foreground': p.textPrimary,
            '--sidebar-border': p.border,
            '--sidebar-ring': p.brand,
            // Les valeurs exactes d'une charte, quand elle en fournit.
            ...(p.shadcn || {}),
        },
        pageBg: p.pageBg,
        sidebarBg: p.sidebarBg,
        headerBg: p.headerBg,
        cardBg: p.cardBg,
        cardBgHover: p.cardBgHover,
        border: p.border,
        divider: p.divider,
        textPrimary: p.textPrimary,
        textSecondary: p.textSecondary,
        textMuted: p.textMuted,
        textDisabled: p.textDisabled,
        itemActiveBg: p.itemActiveBg,
        itemHoverBg: p.itemHoverBg,
        inputBg: p.inputBg,
        inputBorder: p.inputBorder,
        dropdownBg: p.dropdownBg,
        dropdownBorder: p.dropdownBorder,
        dropdownShadow: p.dropdownShadow,
        accent: p.brand,
        brand: p.brand,
        success: p.success,
    };
}

export const DASHBOARD_THEMES: Record<string, DashboardTheme> = {
    dark: construire('dark', 'Sombre', SOMBRE),
    light: construire('light', 'Clair', CLAIR),
};

export function getDashboardTheme(id?: string | null): DashboardTheme {
    return DASHBOARD_THEMES[id ?? 'dark'] ?? DASHBOARD_THEMES.dark;
}
