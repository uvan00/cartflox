"use client";

import { MARQUE, MARQUE_ICONE } from "@/lib/marque";

import { useState, type ReactNode } from "react";
import { ChevronLeft, Lightbulb, Loader2 } from "lucide-react";
import { themeAuth, PiedCartflox } from "@/components/auth/coque-auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/coque/ui/select";
import { POLICE_TEXTE } from "@/components/checkout/coque";

/**
 * Ouverture d'un espace : le marchand branche ses propres passerelles.
 *
 * Une seule colonne centree : le titre, un encart qui dit ce qu'est un espace,
 * trois champs, un bouton. Rien d'autre a l'ecran, parce qu'il n'y a qu'une
 * chose a faire. En mode `premier` (plein ecran, juste apres l'inscription) la
 * page ajoute son en-tete et son pied ; sinon le bloc vit dans la coquille du
 * tableau de bord.
 */
export type Variante = "classique";

const CONTENU: Record<Variante, {
    marque: string; icone: string; accent: string; titre: string; quoi: string;
    secteurs: string[]; note: string; bouton: string;
}> = {
    classique: {
        marque: MARQUE, icone: MARQUE_ICONE, accent: "#864FFE",
        titre: "Créez votre espace",
        quoi: "Un espace représente une activité : une boutique, un projet ou une entreprise, chacun avec ses propres passerelles, ses liens de paiement, ses clés API et son équipe.",
        secteurs: ["E-commerce", "SaaS & Logiciel", "Services financiers", "Éducation", "Santé", "Voyage & tourisme", "Autre"],
        note: "Aucune commission : vous branchez vos propres clés d'agrégateur à l'étape suivante.",
        bouton: "Créer l'espace",
    },
};

export type Creation = { nom: string; site: string; secteur: string };

export function NouvelEspaceForm({ variante, premier = false, email, retourHref, creer }: {
    variante: Variante;
    premier?: boolean;
    email?: string;
    retourHref?: string;
    /** Cree l'espace et redirige ; renvoie un message d'erreur sinon. */
    creer: (d: Creation) => Promise<string | null>;
}) {
    const c = CONTENU[variante];
    const t = themeAuth;
    const [nom, setNom] = useState("");
    const [site, setSite] = useState("");
    const [secteur, setSecteur] = useState("");
    const [erreur, setErreur] = useState<string | null>(null);
    const [envoi, setEnvoi] = useState(false);
    const valide = nom.trim().length >= 2 && site.trim().length >= 4;
    const secteursOptions = [{ value: "", label: "Choisir une catégorie (facultatif)" }, ...c.secteurs.map((x) => ({ value: x, label: x }))];

    // Plein ecran : tons clairs des pages de compte ; dans la coquille : tons du tableau de bord.
    const p = premier
        ? { fond: t.pageBg, carte: t.cardBg, bord: t.cardBorder, texte: t.textPrimary, doux2: t.textSecondary, muted: t.textMuted, champ: "#ffffff", champBord: "#d9d7dd", doux: "#f7f7f7" }
        : { fond: "transparent", carte: "var(--dt-card-bg)", bord: "var(--dt-border)", texte: "var(--dt-text-primary)", doux2: "var(--dt-text-secondary)", muted: "var(--dt-text-muted)", champ: "var(--dt-input-bg)", champBord: "var(--dt-input-border)", doux: "var(--dt-item-hover)" };

    const envoyer = async (e: React.FormEvent) => {
        e.preventDefault();
        setErreur(null);
        if (nom.trim().length < 2) { setErreur("Donnez un nom à votre espace."); return; }
        if (site.trim().length < 4) { setErreur("Indiquez le lien de votre site ou de votre page."); return; }
        setEnvoi(true);
        try {
            const message = await creer({ nom: nom.trim(), site: site.trim(), secteur });
            if (message) { setErreur(message); setEnvoi(false); }
        } catch {
            setErreur("Création impossible, vérifiez le réseau.");
            setEnvoi(false);
        }
    };

    const styleChamp: React.CSSProperties = {
        background: p.champ, border: `1px solid ${p.champBord}`, color: p.texte,
        height: 56, borderRadius: 12, width: "100%", padding: "0 16px", fontSize: 15, outline: "none",
    };

    const contenu = (
        <div className="mx-auto w-full max-w-[600px]" style={{ fontFamily: POLICE_TEXTE }}>
            <h1 className="mb-12 text-center text-[32px] font-bold leading-[1.15] tracking-tight md:mb-16 md:text-[40px]" style={{ color: p.texte }}>
                {c.titre}
            </h1>

            <div className="mb-10 flex items-start gap-3 rounded-xl p-4" style={{ background: p.doux, color: p.muted }}>
                <Lightbulb size={22} className="mt-0.5 shrink-0" style={{ color: c.accent }} />
                <p className="text-[14.5px] leading-relaxed">{c.quoi}</p>
            </div>

            <form onSubmit={envoyer} className="grid gap-10">
                <Champ label="Nom de l'espace" requis texte={p.texte}>
                    <input value={nom} onChange={(e) => setNom(e.target.value)} disabled={envoi} autoFocus maxLength={80} required
                        placeholder="Ex. Ma Boutique" style={styleChamp} />
                </Champ>

                <Champ label="Site web ou page" requis texte={p.texte} aide="Votre site, ou votre page Instagram, Facebook ou WhatsApp Business." muted={p.muted}>
                    <input value={site} onChange={(e) => setSite(e.target.value)} disabled={envoi} maxLength={200} required
                        placeholder="maboutique.com ou instagram.com/maboutique" style={styleChamp} />
                </Champ>

                <Champ label="Secteur d'activité" texte={p.texte}>
                    <Select items={secteursOptions} value={secteur} onValueChange={(v) => setSecteur(String(v ?? ""))} disabled={envoi}>
                        <SelectTrigger className="w-full" style={styleChamp}>
                            <SelectValue>{secteur || <span style={{ color: p.muted }}>Choisir une catégorie (facultatif)</span>}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {secteursOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </Champ>

                {erreur && <p className="-mt-4 text-[14px] font-medium" style={{ color: "#dc2626" }}>{erreur}</p>}

                <div className="flex justify-center">
                    <button type="submit" disabled={!valide || envoi}
                        className="inline-flex h-14 items-center justify-center gap-2 rounded-xl px-9 text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: c.accent, color: "#ffffff" }}>
                        {envoi && <Loader2 size={16} className="animate-spin" />}
                        {envoi ? "Création en cours" : c.bouton}
                    </button>
                </div>

                <p className="-mt-4 text-center text-[13px] leading-relaxed" style={{ color: p.muted }}>{c.note}</p>
            </form>
        </div>
    );

    if (!premier) return <div className="px-4 py-8 md:py-14">{contenu}</div>;

    return (
        <div className="min-h-screen" style={{ background: p.fond, color: p.texte, fontFamily: POLICE_TEXTE }}>
            <header className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 py-5">
                <a href="/" className="inline-flex items-center gap-2 no-underline">
                    <img src={c.icone} alt="" className="h-7 w-7" />
                    <span className="text-[16px] font-semibold" style={{ color: p.texte }}>{c.marque}</span>
                </a>
                <div className="flex items-center gap-4">
                    {email && <span className="hidden truncate text-[12.5px] sm:inline" style={{ color: p.muted }}>{email}</span>}
                    {retourHref && (
                        <a href={retourHref} className="inline-flex items-center gap-1 text-[13px] font-medium no-underline" style={{ color: p.doux2 }}>
                            <ChevronLeft size={15} /> Retour
                        </a>
                    )}
                </div>
            </header>

            <main className="px-4 pb-16 md:px-6">
                <div className="mx-auto max-w-[1120px] rounded-2xl px-5 py-14 md:px-10 md:py-20" style={{ background: p.carte, border: `1px solid ${p.bord}` }}>{contenu}</div>
            </main>

            <div className="mx-auto flex max-w-[1120px] justify-center px-5 pb-10"><PiedCartflox theme={t} /></div>
        </div>
    );
}

function Champ({ label, requis, aide, texte, muted, children }: { label: string; requis?: boolean; aide?: string; texte: string; muted?: string; children: ReactNode }) {
    return (
        <label className="grid gap-2.5">
            <span className="text-[15px] font-semibold" style={{ color: texte }}>
                {label}{requis && <span aria-hidden="true" style={{ color: "#dc2626" }}> *</span>}
            </span>
            {children}
            {aide && <span className="text-[12.5px]" style={{ color: muted }}>{aide}</span>}
        </label>
    );
}
