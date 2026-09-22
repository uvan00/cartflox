import { MARQUE } from "@/lib/marque";

/**
 * Gabarit commun de tous les e-mails Cartflox.
 *
 * La structure reprend les gabarits transactionnels de Postmark (MIT,
 * github.com/ActiveCampaign/postmark-templates) : tableaux HTML eprouves sur
 * une trentaine de clients mail, bouton « bulletproof » a bordures (technique
 * Litmus), variante telephone et variante sombre. Adapte a la marque Cartflox,
 * sans image ni police externe.
 *
 * Les styles sont ecrits en ligne (aucun outil d'inlining ici, et Outlook
 * ignore une bonne partie des feuilles de style) ; la feuille du <head> ne sert
 * qu'aux surcharges impossibles en ligne : media query et mode sombre.
 *
 * Chaque e-mail a aussi une version texte, pour les clients qui n'affichent pas
 * le HTML et pour la delivrabilite.
 */

export const SITE = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
export const ACCENT = "#6D28D9";
/** Fond des boutons et couleur des liens : texte blanc lisible dessus (contraste 7,1:1). */
const ACCENT_FONCE = ACCENT;

const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
const PAGE = "#f2f4f6";
const TEXTE = "#51545e";
const TITRE = "#333333";
const DOUX = "#85878e";
const GRIS_PIED = "#a8aaaf";
const TRAIT = "#eaeaec";
const BLOC = "#f4f5f7";

/** Couleur du gros chiffre, declinee en clair et en sombre. */
export type Ton = "accent" | "alerte";
const TONS: Record<Ton, { clair: string; sombre: string }> = {
    accent: { clair: ACCENT_FONCE, sombre: "#C4B5FD" },
    alerte: { clair: "#b91c1c", sombre: "#fca5a5" },
};

export type Ligne = [string, string];
export type Gabarit = {
    /** Titre principal de l'e-mail. */
    titre: string;
    /** Phrase d'apercu (visible dans la liste des messages, pas dans le corps). */
    apercu?: string;
    /** "Bonjour Awa," */
    salutation?: string;
    /** Paragraphes du corps (HTML simple autorise : strong, a, br). */
    paragraphes?: string[];
    /** Gros chiffre mis en avant (montant, taux...). */
    montant?: { valeur: string; legende?: string; ton?: Ton };
    /** Tableau libelle / valeur. */
    lignes?: Ligne[];
    /** Bouton d'action principal. */
    bouton?: { label: string; url: string };
    /** Petit texte apres le bouton (lien de secours, validite...). */
    note?: string;
    /** Pourquoi le destinataire recoit ce message. */
    pied?: string;
};

export function echapper(s: unknown): string {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Montant lisible : 5 000 XOF. */
export function montant(n: number, devise = "XOF"): string {
    return `${new Intl.NumberFormat("fr-FR").format(Math.round(n || 0))} ${devise}`;
}

const sansBalises = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").trim();

/** Surcharges impossibles en ligne : telephone et mode sombre. */
const FEUILLE = `
    body { width:100% !important; height:100%; margin:0; padding:0; -webkit-text-size-adjust:none; }
    td { word-break:break-word; }
    a { color:${ACCENT_FONCE}; }
    a img { border:none; }
    .cf-apercu { display:none !important; visibility:hidden; mso-hide:all; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; }
    .cf-logo-sombre { display:none !important; }
    @media only screen and (max-width:620px) {
      .cf-cellule { padding:26px 22px !important; }
      .cf-nombre { font-size:26px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .cf-page, .cf-carte, .cf-entete, .cf-pied { background-color:#1f2124 !important; }
      .cf-carte { border-color:#33363b !important; }
      h1, h2, p, td, th, span, strong, .cf-libelle, .cf-valeur { color:#e9eaec !important; }
      .cf-doux, .cf-pied p { color:#a8aaaf !important; }
      .cf-bloc { background-color:#2a2d31 !important; }
      .cf-trait { border-color:#3a3d42 !important; }
      .cf-logo-clair { display:none !important; }
      .cf-logo-sombre { display:inline-block !important; }
    }
    :root { color-scheme:light dark; supported-color-schemes:light dark; }
`;

export function gabarit(g: Gabarit): { html: string; text: string } {
    const p = (g.paragraphes || []).filter(Boolean);
    const cellule = `padding:35px;font-family:${POLICE};`;
    const paragraphe = `margin:0 0 16px;font-size:15px;line-height:1.625;color:${TEXTE};`;

    const ton = TONS[g.montant?.ton || "accent"];
    const blocMontant = g.montant ? `
              <table role="presentation" class="cf-bloc" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BLOC};border-radius:8px;margin:0 0 24px;">
                <tr><td align="center" style="padding:20px 16px;font-family:${POLICE};">
                  <div class="cf-nombre" style="font-size:30px;line-height:1.15;font-weight:bold;letter-spacing:-0.5px;color:${ton.clair};">${echapper(g.montant.valeur)}</div>
                  ${g.montant.legende ? `<div class="cf-doux" style="margin-top:6px;font-size:12px;color:${DOUX};">${echapper(g.montant.legende)}</div>` : ""}
                </td></tr>
              </table>` : "";

    const blocLignes = g.lignes && g.lignes.length ? `
              <table role="presentation" class="cf-bloc" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BLOC};border-radius:8px;margin:0 0 24px;">
                <tr><td style="padding:18px 20px;font-family:${POLICE};">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    ${g.lignes.map(([l, v], i) => `<tr>
                      <td class="cf-libelle" style="padding:${i ? "9px" : "0"} 12px 0 0;font-size:13px;line-height:1.5;color:${DOUX};" valign="top">${echapper(l)}</td>
                      <td class="cf-valeur" align="right" style="padding:${i ? "9px" : "0"} 0 0;font-size:13px;line-height:1.5;font-weight:bold;color:${TITRE};" valign="top">${echapper(v)}</td>
                    </tr>`).join("\n                    ")}
                  </table>
                </td></tr>
              </table>` : "";

    // Bouton a bordures : le seul qui se colore aussi dans Outlook.
    const blocBouton = g.bouton ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr><td align="center" style="font-family:${POLICE};">
                  <a href="${echapper(g.bouton.url)}" target="_blank" rel="noopener" style="display:inline-block;background-color:${ACCENT_FONCE};border-top:12px solid ${ACCENT_FONCE};border-bottom:12px solid ${ACCENT_FONCE};border-left:22px solid ${ACCENT_FONCE};border-right:22px solid ${ACCENT_FONCE};border-radius:6px;color:#ffffff;font-family:${POLICE};font-size:15px;font-weight:bold;line-height:1;text-decoration:none;-webkit-text-size-adjust:none;box-sizing:border-box;">${echapper(g.bouton.label)}</a>
                </td></tr>
              </table>` : "";

    const blocNote = g.note ? `
              <table role="presentation" class="cf-trait" width="100%" cellpadding="0" cellspacing="0" style="margin-top:25px;padding-top:25px;border-top:1px solid ${TRAIT};">
                <tr><td style="font-family:${POLICE};"><p class="cf-doux" style="margin:0;font-size:13px;line-height:1.6;color:${DOUX};">${g.note}</p></td></tr>
              </table>` : "";

    const html = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${echapper(g.titre)}</title>
<style type="text/css" rel="stylesheet" media="all">${FEUILLE}
    @media (prefers-color-scheme: dark) { .cf-nombre { color:${ton.sombre} !important; } }
</style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE};color:${TEXTE};font-family:${POLICE};">
${g.apercu ? `<span class="cf-apercu">${echapper(g.apercu)}</span>` : ""}
<table role="presentation" class="cf-page" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE};margin:0;padding:0;width:100%;">
<tr><td align="center" style="padding:0 12px;">

  <table role="presentation" class="cf-entete" width="570" cellpadding="0" cellspacing="0" style="width:100%;max-width:570px;">
    <tr><td align="center" style="padding:25px 0;font-family:${POLICE};">
      <a href="${SITE}" target="_blank" rel="noopener" style="text-decoration:none;">
        <img src="${SITE}/logos/cartflox-email.png" alt="Cartflox" width="140" height="35" class="cf-logo-clair" style="display:inline-block;width:140px;height:35px;border:0;outline:none;vertical-align:middle;text-decoration:none;font-size:16px;font-weight:bold;color:${GRIS_PIED};">
        <!--[if !mso]><!-->
        <img src="${SITE}/logos/cartflox-email-sombre.png" alt="Cartflox" width="140" height="35" class="cf-logo-sombre" style="display:none;width:140px;height:35px;border:0;outline:none;vertical-align:middle;text-decoration:none;font-size:16px;font-weight:bold;color:${GRIS_PIED};">
        <!--<![endif]-->
      </a>
    </td></tr>
  </table>

  <table role="presentation" class="cf-carte" width="570" cellpadding="0" cellspacing="0" style="width:100%;max-width:570px;background-color:#ffffff;border:1px solid #edeff2;border-radius:10px;">
    <tr><td class="cf-cellule" style="${cellule}">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:bold;color:${TITRE};">${echapper(g.titre)}</h1>
      ${g.salutation ? `<p style="${paragraphe}">${echapper(g.salutation)}</p>` : ""}
      ${p.map((x) => `<p style="${paragraphe}">${x}</p>`).join("\n      ")}
      ${blocMontant}${blocLignes}${blocBouton}${blocNote}
    </td></tr>
  </table>

  <table role="presentation" class="cf-pied" width="570" cellpadding="0" cellspacing="0" style="width:100%;max-width:570px;">
    <tr><td align="center" style="padding:28px 20px 34px;font-family:${POLICE};">
      <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${GRIS_PIED};">${g.pied ? g.pied : `Vous recevez cet e-mail parce que vous avez un compte ${MARQUE}.`}</p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${GRIS_PIED};">${MARQUE}, orchestrateur de paiements pour l'Afrique. <a href="${SITE}" target="_blank" rel="noopener" style="color:${GRIS_PIED};text-decoration:underline;">${SITE.replace(/^https?:\/\//, "")}</a>. Une question ? Répondez simplement à cet e-mail.</p>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;

    const text = [
        g.titre,
        "",
        g.salutation || "",
        ...p.map(sansBalises),
        g.montant ? `${g.montant.valeur}${g.montant.legende ? ` (${g.montant.legende})` : ""}` : "",
        ...(g.lignes || []).map(([l, v]) => `${l} : ${v}`),
        g.bouton ? `${g.bouton.label} : ${g.bouton.url}` : "",
        g.note ? sansBalises(g.note) : "",
        "",
        sansBalises(g.pied || `Vous recevez cet e-mail parce que vous avez un compte ${MARQUE}.`),
        `${MARQUE}, orchestrateur de paiements pour l'Afrique. ` + SITE,
    ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0)).join("\n");

    return { html, text };
}
