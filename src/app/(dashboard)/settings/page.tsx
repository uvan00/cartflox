"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";
import { User, Building2, Palette, ShieldCheck, Bell, CreditCard, Upload, Users2, Lock } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getFullCurrentApplication, getCurrentUser, updateUserProfile, updateApplicationDetails, updateApplicationImage, updateEmailNotificationSettings } from "@/lib/actions/settings";
import { PersonnalisationCheckout } from "@/components/dashboard/checkout-customization";
import { Page, Bloc, Onglets, Champ, Entree, Bouton, Interrupteur, Aide, Squelette, LienCarte, Pastille } from "@/components/dashboard/kit";
import { getPaymentContext } from "@/lib/actions/applications";

/**
 * Parametres : profil, entreprise, page de paiement, verification,
 * notifications. La securite du compte est sur sa propre page,
 * l'equipe aussi.
 */
type Onglet = "profil" | "entreprise" | "checkout" | "notifications";
const ONGLETS = [
    { cle: "profil" as Onglet, label: "Profil", icone: User },
    { cle: "entreprise" as Onglet, label: "Entreprise", icone: Building2 },
    { cle: "checkout" as Onglet, label: "Page de paiement", icone: Palette },
    { cle: "notifications" as Onglet, label: "Notifications", icone: Bell },
];
const ALIAS: Record<string, Onglet> = { profile: "profil", company: "entreprise", appearance: "checkout", security: "profil" };

export default function ParametresPage() {
    const params = useSearchParams();
    const { data: session, update: majSession } = useSession();
    const demande = params?.get("tab") || "";
    const ongletUrl: Onglet = ONGLETS.some((o) => o.cle === demande) ? (demande as Onglet) : ALIAS[demande] || "profil";
    const [onglet, setOnglet] = useState<Onglet>(ongletUrl);
    // Le menu du compte pointe vers /settings?tab=... : sans cela l'onglet ne
    // bougeait qu'au premier affichage, et le menu semblait sans effet.
    useEffect(() => { setOnglet(ongletUrl); }, [ongletUrl]);
    const [charge, setCharge] = useState(false);
    const [occupe, setOccupe] = useState("");
    const [profil, setProfil] = useState({ name: "", email: "", phone: "", country: "", image: "" });
    const [entreprise, setEntreprise] = useState({ name: "", website: "", image: "" });
    const [notif, setNotif] = useState({ marchand: true, client: true });
    // Un espace Connect encaisse avec une commission : le discours n'est pas le meme.
    const [gere, setGere] = useState<{ managed: boolean; commissionBps: number } | null>(null);
    const fichierProfil = useRef<HTMLInputElement | null>(null);
    const fichierLogo = useRef<HTMLInputElement | null>(null);

    const charger = useCallback(async () => {
        const [app, user] = await Promise.all([getFullCurrentApplication(), getCurrentUser()]);
        if (app) {
            setEntreprise({ name: app.name || "", website: app.website || "", image: app.image || "" });
            const meta = (app.metadata as any) || {};
            setNotif({ marchand: meta.notifyMerchantOnPayment !== false, client: meta.notifyCustomerOnPayment !== false });
        }
        if (user) setProfil({ name: user.name || "", email: user.email || "", phone: (user as any).phone || "", country: (user as any).country || "", image: (user as any).image || "" });
        setCharge(true);
    }, []);
    useEffect(() => { charger(); getPaymentContext().then(setGere).catch(() => setGere(null)); }, [charger]);

    async function televerser(fichier: File): Promise<string | null> {
        const form = new FormData(); form.append("file", fichier);
        const r = await fetch("/api/upload-image", { method: "POST", body: form });
        const d: any = await r.json().catch(() => ({}));
        if (!d.success || !d.url) { goeyToast.error(d.error || "Envoi impossible"); return null; }
        return d.url;
    }
    async function photoProfil(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]; if (!f) return;
        setOccupe("photo"); const url = await televerser(f); setOccupe("");
        if (!url) return;
        const r = await updateUserProfile({ name: profil.name, email: profil.email, image: url });
        if (r.success) { setProfil({ ...profil, image: url }); localStorage.setItem("afriflow-profile-pic", url); window.dispatchEvent(new CustomEvent("afriflow-profile-pic-change", { detail: url })); await majSession({ image: url }); goeyToast.success("Photo mise à jour"); }
        else goeyToast.error(r.error || "Échec");
        e.target.value = "";
    }
    async function logoEntreprise(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0]; if (!f) return;
        setOccupe("logo"); const url = await televerser(f); setOccupe("");
        if (!url) return;
        const r = await updateApplicationImage(url);
        if (r.success) { setEntreprise({ ...entreprise, image: url }); goeyToast.success("Logo mis à jour : il apparaît sur votre page de paiement"); } else goeyToast.error(r.error || "Échec");
        e.target.value = "";
    }
    async function sauverProfil() {
        setOccupe("profil");
        const r = await updateUserProfile({ name: profil.name, email: profil.email, phone: profil.phone, country: profil.country });
        setOccupe("");
        if (r.success) { goeyToast.success("Profil enregistré"); await majSession({}); } else goeyToast.error(r.error || "Échec");
    }
    async function sauverEntreprise() {
        setOccupe("entreprise");
        const r = await updateApplicationDetails({ name: entreprise.name, website: entreprise.website });
        setOccupe("");
        r.success ? goeyToast.success("Entreprise enregistrée") : goeyToast.error(r.error || "Échec");
    }
    async function sauverNotif(n: typeof notif) {
        setNotif(n);
        const r = await updateEmailNotificationSettings({ notifyMerchantOnPayment: n.marchand, notifyCustomerOnPayment: n.client });
        r.success ? goeyToast.success("Notifications mises à jour") : goeyToast.error(r.error || "Échec");
    }

    return (
        <Page titre="Paramètres" sousTitre="Votre compte, votre entreprise et l'apparence de votre page de paiement.">
            <Onglets items={ONGLETS} actif={onglet} onChange={setOnglet} />
            {!charge ? <Squelette /> : (
                <>
                    {onglet === "profil" && (
                        <div className="space-y-4">
                            <Bloc titre="Votre profil">
                                <div className="mb-5 flex items-center gap-4">
                                    <div className="h-16 w-16 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}>
                                        {profil.image ? <img src={profil.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xl font-semibold" style={{ color: "var(--dt-text-muted)" }}>{(profil.name || "?").charAt(0).toUpperCase()}</span>}
                                    </div>
                                    <div>
                                        <input ref={fichierProfil} type="file" accept="image/*" className="hidden" onChange={photoProfil} />
                                        <Bouton variante="secondaire" icone={Upload} chargement={occupe === "photo"} onClick={() => fichierProfil.current?.click()}>Changer la photo</Bouton>
                                        <p className="mt-1 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>JPG ou PNG, 2 Mo maximum.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Champ label="Nom complet"><Entree value={profil.name} onChange={(e) => setProfil({ ...profil, name: e.target.value })} /></Champ>
                                    <Champ label="E-mail de connexion" aide="Sert aussi à recevoir vos notifications."><Entree type="email" value={profil.email} onChange={(e) => setProfil({ ...profil, email: e.target.value })} /></Champ>
                                    <Champ label="Téléphone"><Entree value={profil.phone} onChange={(e) => setProfil({ ...profil, phone: e.target.value })} placeholder="+225 07 00 00 00 00" /></Champ>
                                    <Champ label="Pays"><Entree value={profil.country} onChange={(e) => setProfil({ ...profil, country: e.target.value })} placeholder="Côte d'Ivoire" /></Champ>
                                </div>
                                <div className="mt-4"><Bouton chargement={occupe === "profil"} onClick={sauverProfil}>Enregistrer</Bouton></div>
                            </Bloc>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <LienCarte href="/security" icone={Lock} titre="Sécurité du compte" texte="Double authentification, mot de passe, journal des actions sensibles." />
                                <LienCarte href="/team" icone={Users2} titre="Votre équipe" texte="Invitez des collaborateurs et gérez leurs accès." />
                            </div>
                        </div>
                    )}

                    {onglet === "entreprise" && (
                        <Bloc titre="Votre entreprise" sousTitre="Ce nom et ce logo apparaissent sur votre page de paiement, vos reçus et vos liens.">
                            <div className="mb-5 flex items-center gap-4">
                                <div className="h-16 w-16 overflow-hidden rounded-2xl" style={{ background: "var(--dt-item-hover)" }}>
                                    {entreprise.image ? <img src={entreprise.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xl" style={{ color: "var(--dt-text-muted)" }}>⚡</span>}
                                </div>
                                <div>
                                    <input ref={fichierLogo} type="file" accept="image/*" className="hidden" onChange={logoEntreprise} />
                                    <Bouton variante="secondaire" icone={Upload} chargement={occupe === "logo"} onClick={() => fichierLogo.current?.click()}>Changer le logo</Bouton>
                                    <p className="mt-1 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Carré de préférence, fond uni.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Champ label="Nom affiché à vos clients"><Entree value={entreprise.name} onChange={(e) => setEntreprise({ ...entreprise, name: e.target.value })} /></Champ>
                                <Champ label="Site web"><Entree value={entreprise.website} onChange={(e) => setEntreprise({ ...entreprise, website: e.target.value })} placeholder="https://" /></Champ>
                            </div>
                            <div className="mt-4"><Bouton chargement={occupe === "entreprise"} onClick={sauverEntreprise}>Enregistrer</Bouton></div>
                        </Bloc>
                    )}

                    {onglet === "checkout" && <Bloc><PersonnalisationCheckout /></Bloc>}

                    {onglet === "notifications" && (
                        <Bloc titre="Notifications par e-mail" sousTitre="Les reçus et alertes partent de l'adresse configurée pour cette instance.">
                            <div className="divide-y" style={{ borderColor: "var(--dt-divider)" }}>
                                <div className="flex items-center justify-between gap-4 py-3">
                                    <div><p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Me prévenir à chaque paiement reçu</p><p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Montant, moyen de paiement, client, sur {profil.email}.</p></div>
                                    <Interrupteur actif={notif.marchand} onChange={(v) => sauverNotif({ ...notif, marchand: v })} />
                                </div>
                                <div className="flex items-center justify-between gap-4 py-3">
                                    <div><p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Envoyer un reçu à mes clients</p><p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Un reçu de paiement à l&apos;adresse qu&apos;ils ont saisie, avec votre nom.</p></div>
                                    <Interrupteur actif={notif.client} onChange={(v) => sauverNotif({ ...notif, client: v })} />
                                </div>
                            </div>
                                                    </Bloc>
                    )}
                </>
            )}
        </Page>
    );
}
