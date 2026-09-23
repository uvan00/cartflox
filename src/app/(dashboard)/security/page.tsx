"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, ScrollText, Terminal } from "lucide-react";
import { goeyToast } from "goey-toast";
import { authClient } from "@/lib/auth-client";
import { changePassword } from "@/lib/actions/settings";
import { getJournalSecurite, definirMotDePasse } from "@/lib/actions/compte";
import { Page, Bloc, Champ, Entree, Bouton, Pastille, Aide, Vide, Squelette, LienCarte, fmtDate } from "@/components/dashboard/kit";

/**
 * Securite du compte : mot de passe et journal des actions sensibles.
 * Les cles API et le webhook vivent dans API & Logs.
 */

export default function SecuritePage() {
    const [occupe, setOccupe] = useState("");
    const [mdp, setMdp] = useState({ actuel: "", nouveau: "", confirme: "" });
    const [sansMdp, setSansMdp] = useState<boolean | null>(null);
    const [journal, setJournal] = useState<any[] | null>(null);

    useEffect(() => {
        getJournalSecurite(30).then(setJournal).catch(() => setJournal([]));
        // Compte ouvert par un fournisseur d'identite, sans mot de passe : on propose d'en definir un.
        authClient.listAccounts()
            .then((r) => setSansMdp(!!r.data && !r.data.some((a) => a.providerId === "credential")))
            .catch(() => setSansMdp(false));
    }, []);

    async function changerMdp() {
        if (mdp.nouveau.length < 8) { goeyToast.error("8 caractères minimum."); return; }
        if (mdp.nouveau !== mdp.confirme) { goeyToast.error("Les deux nouveaux mots de passe ne correspondent pas."); return; }
        setOccupe("mdp");
        const r = sansMdp ? await definirMotDePasse(mdp.nouveau) : await changePassword({ currentPassword: mdp.actuel, newPassword: mdp.nouveau });
        setOccupe("");
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(sansMdp ? "Mot de passe défini" : "Mot de passe modifié");
        setMdp({ actuel: "", nouveau: "", confirme: "" });
        if (sansMdp) setSansMdp(false);
    }

    return (
        <Page titre="Sécurité" sousTitre="Protégez l'accès à votre compte. Pour vos clés API et votre webhook, rendez-vous dans API & Logs.">
            <div className="grid grid-cols-1 gap-4">
                <Bloc titre={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Mot de passe</span>}
                    sousTitre={sansMdp ? "Votre compte a été ouvert par un fournisseur d'identité et n'a pas encore de mot de passe : définissez-en un pour pouvoir aussi vous connecter par e-mail." : "Il protège l'accès à votre tableau de bord et à vos clés. 8 caractères minimum."}>
                    <div className="space-y-3">
                        {!sansMdp && <Champ label="Mot de passe actuel"><Entree type="password" autoComplete="current-password" value={mdp.actuel} onChange={(e) => setMdp({ ...mdp, actuel: e.target.value })} /></Champ>}
                        <Champ label="Nouveau mot de passe"><Entree type="password" autoComplete="new-password" value={mdp.nouveau} onChange={(e) => setMdp({ ...mdp, nouveau: e.target.value })} /></Champ>
                        <Champ label="Confirmez-le"><Entree type="password" autoComplete="new-password" value={mdp.confirme} onChange={(e) => setMdp({ ...mdp, confirme: e.target.value })} /></Champ>
                        <Bouton chargement={occupe === "mdp"} onClick={changerMdp} disabled={(!sansMdp && !mdp.actuel) || !mdp.nouveau}>{sansMdp ? "Définir le mot de passe" : "Modifier le mot de passe"}</Bouton>
                    </div>
                </Bloc>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <LienCarte href="/developer" icone={Terminal} titre="Clés API et webhook" texte="Vos identifiants d'intégration, leur rotation et l'adresse qui reçoit vos confirmations de paiement." />
                <LienCarte href="/team" icone={ShieldCheck} titre="Accès de votre équipe" texte="Qui a accès à votre espace, avec quels droits." />
            </div>

            <Bloc titre={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Journal de votre compte</span>} sousTitre="Les actions sensibles : connexions, clés, webhook, équipe, décisions.">
                {journal === null ? <Squelette lignes={4} /> : journal.length === 0 ? <Vide titre="Rien pour le moment" /> : (
                    <div className="divide-y" style={{ borderColor: "var(--dt-divider)" }}>
                        {journal.map((l) => (
                            <div key={l.id} className="flex flex-wrap justify-between gap-2 py-2.5 text-sm">
                                <span style={{ color: "var(--dt-text-primary)" }}>{l.action}</span>
                                <span className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{l.actorName}, {fmtDate(l.createdAt)}{l.ipAddress ? `, ${l.ipAddress}` : ""}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Bloc>
        </Page>
    );
}
