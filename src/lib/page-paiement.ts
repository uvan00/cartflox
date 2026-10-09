/**
 * Pages vues par les CLIENTS des marchands : la page de paiement (et sa forme
 * courte, checkout.<domaine>/<id>) et les liens de paiement. Elles ont leur
 * propre charte, claire par defaut, et ne prennent rien du tableau de bord :
 * ni son theme sombre, ni son kit d'interface.
 *
 * Meme regle dans le script de <head> de app/layout.tsx, qui s'execute avant
 * le premier rendu : a changer ensemble.
 */
export function estPagePaiement(chemin: string, hote: string): boolean {
    return /^checkout\./i.test(hote) || chemin.startsWith("/checkout") || chemin.startsWith("/pay/");
}
