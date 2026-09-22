/**
 * Page d'erreur de Better Auth, reprise ici.
 *
 * Au retour du fournisseur d'identite, le navigateur rejoue parfois la meme adresse de retour
 * (reseau mobile qui coupe et relance, navigateur integre a WhatsApp). Better
 * Auth efface l'etat des la premiere lecture : la seconde ne le trouve plus et
 * echoue en « state_mismatch ». Cette erreur-la n'a pas d'adresse de repli, donc
 * Better Auth deposait la personne sur l'accueil du site, apres une connexion
 * pourtant reussie : « je finis de me connecter et je suis redirige nulle part ».
 *
 * On revient donc sur la page de connexion, qui sait rattraper : si la premiere
 * requete a bien ouvert la session, elle repart aussitot vers la destination ;
 * sinon elle rejoue la demande en silence, la session chez le fournisseur etant desormais
 * ouverte. Les autres erreurs y sont simplement expliquees.
 */

/** Erreurs d'un retour joue deux fois ou perime : la page de connexion les rattrape seule. */
const RATTRAPABLES = new Set(["state_mismatch", "state_invalid", "please_restart_the_process"]);

export const dynamic = "force-dynamic";

export function GET(requete: Request) {
    const recus = new URL(requete.url).searchParams;
    const code = recus.get("error") || "";
    const params = new URLSearchParams();
    if (RATTRAPABLES.has(code)) params.set("reprise", code);
    else if (code) params.set("error", code);
    const requete_ = params.toString();
    return new Response(null, { status: 302, headers: { Location: `/auth/login${requete_ ? `?${requete_}` : ""}` } });
}
