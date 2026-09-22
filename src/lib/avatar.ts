/** Avatar de repli (dicebear) quand le compte n'a pas de photo, seme par le nom ou l'adresse. */
export function avatarParDefaut(graine?: string | null) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(graine || "user")}`;
}
