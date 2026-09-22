"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { ArrowLeft, Check, Copy, ImagePlus, Link2, QrCode, ExternalLink, Plus, ArrowRight, Trash2, Package } from "lucide-react";
import { goeyToast } from "goey-toast";
import { createPaymentLink, qrPaymentLink } from "@/lib/actions/payment-links";
import { getPaymentContext } from "@/lib/actions/applications";
import { Page, Bloc, Champ, Entree, Zone, Choix, Bouton, Interrupteur, Aide, fmtMontant } from "@/components/dashboard/kit";

/**
 * Creation d'un lien de paiement : l'essentiel d'abord (titre, montant),
 * les options ensuite, un apercu de la page client a droite, et une fois le
 * lien cree, tout pour le partager sans quitter l'ecran.
 *
 * Trois reglages demandes par les marchands :
 *  - MONTANT LIBRE : le client saisit ce qu'il veut payer (don, acompte,
 *    ardoise), avec des bornes facultatives ;
 *  - FRAIS : qui les endosse, pour CE lien, sans toucher au reglage de l'espace ;
 *  - IMAGES : jusqu'a quatre, pour que la page du client soit une vraie fiche
 *    produit et pas seulement un formulaire.
 */
const OPERATEURS = [["/logos/orange-money.svg", "Orange Money"], ["/logos/wave.svg", "Wave"], ["/logos/mtn-momo.svg", "MTN MoMo"], ["/logos/moov-money.svg", "Moov Money"], ["/logos/credit_card.svg", "Carte"]];
const MAX_IMAGES = 4;

export default function NouveauLienPage() {
    const { data: session } = useSession();
    const [f, setF] = useState({
        title: "", amount: "", description: "", allowQuantity: false, requestPhone: true, expiresAt: "", customSuccessMessage: "", webhookUrl: "", facebookPixelId: "", googleAdsId: "",
        amountFree: false, amountMin: "", amountMax: "", frais: "espace" as "espace" | "marchand" | "client",
    });
    const [images, setImages] = useState<string[]>([]);
    const [envoiImage, setEnvoiImage] = useState(false);
    const fichier = useRef<HTMLInputElement>(null);
    // L'espace decide s'il y a des frais de service a repartir : un marchand
    // qui branche ses propres cles paie son agregateur, pas nous.
    const [ctx, setCtx] = useState<{ managed: boolean; fraisClient: boolean; fraisBps: number } | null>(null);
    const [occupe, setOccupe] = useState(false);
    const [cree, setCree] = useState<{ url: string; slug: string; title: string; amount: number; libre: boolean } | null>(null);
    const [copie, setCopie] = useState(false);
    const [qr, setQr] = useState<string | null>(null);
    const maj = (k: keyof typeof f, v: any) => setF({ ...f, [k]: v });
    const montant = Math.round(Number(f.amount) || 0);

    useEffect(() => { getPaymentContext().then((c) => setCtx({ managed: c.managed, fraisClient: c.fraisClient, fraisBps: c.fraisBps })).catch(() => setCtx(null)); }, []);

    async function ajouterImage(e: React.ChangeEvent<HTMLInputElement>) {
        const fic = e.target.files?.[0];
        e.target.value = "";
        if (!fic) return;
        if (images.length >= MAX_IMAGES) { goeyToast.error(`${MAX_IMAGES} images au maximum.`); return; }
        setEnvoiImage(true);
        const form = new FormData(); form.append("file", fic);
        const r = await fetch("/api/upload-image", { method: "POST", body: form });
        const d: any = await r.json().catch(() => ({}));
        setEnvoiImage(false);
        if (!d.success || !d.url) { goeyToast.error(d.error || "Envoi impossible"); return; }
        setImages((liste) => [...liste, d.url].slice(0, MAX_IMAGES));
    }

    async function creer() {
        if (!f.title.trim()) { goeyToast.error("Donnez un titre à votre lien."); return; }
        if (!f.amountFree && montant < 100) { goeyToast.error("Le montant doit être d'au moins 100 XOF."); return; }
        const mini = Math.round(Number(f.amountMin) || 0);
        const maxi = Math.round(Number(f.amountMax) || 0);
        if (f.amountFree && mini > 0 && maxi > 0 && maxi < mini) { goeyToast.error("Le montant maximum doit être supérieur au minimum."); return; }
        if (f.webhookUrl && !/^https:\/\//.test(f.webhookUrl)) { goeyToast.error("L'adresse du webhook doit commencer par https://"); return; }
        setOccupe(true);
        const r = await createPaymentLink({
            title: f.title.trim(), description: f.description.trim() || undefined, amount: montant, currency: "XOF",
            requestPhone: f.requestPhone, allowQuantity: f.allowQuantity, webhookUrl: f.webhookUrl.trim() || undefined,
            facebookPixelId: f.facebookPixelId.trim() || undefined, googleAdsId: f.googleAdsId.trim() || undefined,
            customSuccessMessage: f.customSuccessMessage.trim() || undefined, expiresAt: f.expiresAt ? new Date(f.expiresAt) : undefined,
            amountFree: f.amountFree, amountMin: mini, amountMax: maxi,
            feesOnCustomer: f.frais === "espace" ? null : f.frais === "client",
            images,
        });
        setOccupe(false);
        if (!r.success || !r.data) { goeyToast.error(r.error || "Création impossible"); return; }
        const url = (r.data as { url?: string }).url || `${window.location.origin}/pay/${r.data.slug}`;
        setCree({ url, slug: r.data.slug, title: r.data.title, amount: r.data.amount, libre: f.amountFree });
        qrPaymentLink(r.data.slug).then((q) => { if (q.success && q.dataUrl) setQr(q.dataUrl); });
        goeyToast.success("Votre lien est prêt");
    }
    function copier() { if (!cree) return; navigator.clipboard.writeText(cree.url).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1500); }); }
    function whatsapp() {
        if (!cree) return;
        const prix = cree.libre ? "vous choisissez le montant" : fmtMontant(cree.amount);
        window.open(`https://wa.me/?text=${encodeURIComponent(`${cree.title} : ${prix}. Payez ici, par Mobile Money ou carte : ${cree.url}`)}`, "_blank", "noopener");
    }

    if (cree) {
        return (
            <Page titre="Votre lien est prêt" sousTitre="Partagez-le : chaque paiement apparaît dans Transactions et vous êtes prévenu par e-mail.">
                <Bloc>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_200px]">
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{cree.title}, {cree.libre ? "montant libre" : fmtMontant(cree.amount)}</p>
                                <div className="mt-1 flex items-center gap-2">
                                    <Entree readOnly value={cree.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                                    <Bouton icone={copie ? Check : Copy} onClick={copier}>{copie ? "Copié" : "Copier"}</Bouton>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={whatsapp} className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium" style={{ background: "rgba(37,211,102,0.12)", color: "var(--dt-text-primary)", border: "1px solid rgba(37,211,102,0.35)" }}><img src="/logos/whatsapp.svg" alt="" className="h-4 w-4" /> Envoyer sur WhatsApp</button>
                                <a href={cree.url} target="_blank" rel="noopener noreferrer"><Bouton variante="secondaire" icone={ExternalLink}>Voir la page</Bouton></a>
                            </div>
                            <Aide>Collez ce lien dans un bouton de votre site, une story, une bio ou un message. Pour un bouton sur votre site, voyez <Link href="/integrations" className="underline">Intégrations</Link>.</Aide>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <Link href="/payment-links"><Bouton variante="secondaire" icone={ArrowRight}>Voir tous mes liens</Bouton></Link>
                                <Bouton variante="discret" icone={Plus} onClick={() => { setCree(null); setQr(null); setImages([]); setF({ ...f, title: "", amount: "", description: "" }); }}>Créer un autre lien</Bouton>
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            {qr ? <img src={qr} alt="QR code" className="h-44 w-44 rounded-lg bg-white p-2" /> : <div className="flex h-44 w-44 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)" }}><QrCode className="h-6 w-6 opacity-50" /></div>}
                            {qr && <a href={qr} download={`qr-${cree.slug}.png`} className="text-xs underline" style={{ color: "var(--dt-text-muted)" }}>Télécharger le QR code</a>}
                        </div>
                    </div>
                </Bloc>
            </Page>
        );
    }

    const fraisPct = ctx ? (ctx.fraisBps / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "3";
    const fraisApercu = f.frais === "client" || (f.frais === "espace" && ctx?.fraisClient);

    return (
        <Page titre="Nouveau lien de paiement" sousTitre="Un titre et un montant suffisent. Le reste est facultatif." large
            action={<Link href="/payment-links" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--dt-text-muted)" }}><ArrowLeft className="h-4 w-4" /> Mes liens</Link>}>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-5">
                    <Bloc titre="L'essentiel">
                        <div className="space-y-4">
                            <Champ label="Titre" aide="Ce que le client achète. Il le verra sur la page de paiement et sur son reçu."><Entree value={f.title} onChange={(e) => maj("title", e.target.value)} placeholder="Ex. Formation Canva, Abonnement mensuel, Réservation" maxLength={80} /></Champ>

                            <div className="flex items-start justify-between gap-4 rounded-xl px-4 py-3" style={{ border: "1px solid var(--dt-border)" }}>
                                <div>
                                    <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Le client choisit le montant</p>
                                    <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Pour un don, un acompte, une ardoise : la page demande au client combien il veut payer.</p>
                                </div>
                                <Interrupteur actif={f.amountFree} onChange={(v) => maj("amountFree", v)} />
                            </div>

                            {f.amountFree ? (
                                <div className="space-y-4">
                                    <Champ label="Montant suggéré (facultatif)" aide="Pré-rempli sur la page du client, qui reste libre de le changer.">
                                        <div className="relative"><Entree type="number" inputMode="numeric" min={0} step={100} value={f.amount} onChange={(e) => maj("amount", e.target.value)} placeholder="5000" className="pr-14" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: "var(--dt-text-muted)" }}>XOF</span></div>
                                    </Champ>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <Champ label="Minimum (facultatif)" aide="En dessous, la page refuse le paiement."><Entree type="number" inputMode="numeric" min={0} step={100} value={f.amountMin} onChange={(e) => maj("amountMin", e.target.value)} placeholder="1000" /></Champ>
                                        <Champ label="Maximum (facultatif)" aide="Au-dessus, la page refuse le paiement."><Entree type="number" inputMode="numeric" min={0} step={100} value={f.amountMax} onChange={(e) => maj("amountMax", e.target.value)} placeholder="100000" /></Champ>
                                    </div>
                                </div>
                            ) : (
                                <Champ label="Montant" aide="Montant fixe en XOF (franc CFA). Minimum 100.">
                                    <div className="relative"><Entree type="number" inputMode="numeric" min={100} step={100} value={f.amount} onChange={(e) => maj("amount", e.target.value)} placeholder="5000" className="pr-14" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: "var(--dt-text-muted)" }}>XOF</span></div>
                                </Champ>
                            )}

                            <Champ label="Description (facultatif)" aide="Une ou deux phrases : ce qui est inclus, quand le client le reçoit."><Zone rows={3} value={f.description} onChange={(e) => maj("description", e.target.value)} placeholder="Ex. Accès immédiat à la formation, vidéos et fichiers inclus." maxLength={500} /></Champ>
                        </div>
                    </Bloc>

                    <Bloc titre="Images" sousTitre={`Jusqu'à ${MAX_IMAGES} photos de ce que vous vendez. La première est la principale.`}>
                        <div className="flex flex-wrap gap-3">
                            {images.map((src, i) => (
                                <div key={src.slice(0, 40) + i} className="relative h-24 w-24 overflow-hidden rounded-xl" style={{ border: "1px solid var(--dt-border)" }}>
                                    <img src={src} alt="" className="h-full w-full object-cover" />
                                    {i === 0 && <span className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>Principale</span>}
                                    <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="Retirer cette image"
                                        className="absolute bottom-1 right-1 grid h-6 w-6 place-content-center rounded-md" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                            ))}
                            {images.length < MAX_IMAGES && (
                                <button type="button" onClick={() => fichier.current?.click()} disabled={envoiImage}
                                    className="grid h-24 w-24 place-content-center rounded-xl text-xs disabled:opacity-50"
                                    style={{ border: "1px dashed var(--dt-border)", color: "var(--dt-text-muted)" }}>
                                    <span className="flex flex-col items-center gap-1"><ImagePlus className="h-5 w-5" />{envoiImage ? "Envoi..." : "Ajouter"}</span>
                                </button>
                            )}
                            <input ref={fichier} type="file" accept="image/*" className="hidden" onChange={ajouterImage} />
                        </div>
                        <Aide>JPG, PNG ou WEBP, 2 Mo maximum par image. Elles sont redimensionnées automatiquement.</Aide>
                    </Bloc>

                    <Bloc titre="Options" sousTitre="Ce que la page demande et fait après le paiement.">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Demander le numéro de téléphone</p><p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Recommandé : nécessaire pour les relances WhatsApp si le client ne termine pas.</p></div><Interrupteur actif={f.requestPhone} onChange={(v) => maj("requestPhone", v)} /></div>
                            {!f.amountFree && (
                                <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Quantité au choix</p><p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Le client choisit combien d'unités il paie (le montant est multiplié).</p></div><Interrupteur actif={f.allowQuantity} onChange={(v) => maj("allowQuantity", v)} /></div>
                            )}
                            {ctx?.managed && (
                                <Champ label="Frais de service" aide={`Les frais d'encaissement valent ${fraisPct} % du montant. Ce choix ne vaut que pour ce lien : le réglage de votre espace ne change pas.`}>
                                    <Choix value={f.frais} onChange={(v) => maj("frais", v)} options={[
                                        { value: "espace", label: `Comme mon espace (${ctx.fraisClient ? "le client paie" : "à ma charge"})` },
                                        { value: "marchand", label: "À ma charge : le client paie le prix affiché" },
                                        { value: "client", label: `Le client paie les frais (+${fraisPct} %)` },
                                    ]} />
                                </Champ>
                            )}
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Champ label="Date d'expiration (facultatif)" aide="Passée cette date, la page n'accepte plus de paiement."><Entree type="datetime-local" value={f.expiresAt} onChange={(e) => maj("expiresAt", e.target.value)} /></Champ>
                                <Champ label="Message après paiement (facultatif)" aide="Affiché au client une fois le paiement confirmé."><Entree value={f.customSuccessMessage} onChange={(e) => maj("customSuccessMessage", e.target.value)} placeholder="Merci ! Vous recevez l'accès par e-mail sous 5 minutes." maxLength={200} /></Champ>
                            </div>
                        </div>
                    </Bloc>

                    <Bloc titre="Suivi et automatisation" sousTitre="Pour les boutiques qui mesurent leurs publicités ou automatisent la suite.">
                        <div className="space-y-4">
                            <Champ label="Webhook (facultatif)" aide="Cartflox appelle cette adresse à chaque paiement de ce lien, en plus du webhook général de votre espace."><Entree value={f.webhookUrl} onChange={(e) => maj("webhookUrl", e.target.value)} placeholder="https://votre-site.com/webhooks/cartflox" inputMode="url" /></Champ>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Champ label="Pixel Facebook (facultatif)" aide="Identifiant du pixel Meta : l'achat est envoyé comme événement Purchase.">
                                    <div className="relative"><img src="/logos/facebook.svg" alt="" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><Entree value={f.facebookPixelId} onChange={(e) => maj("facebookPixelId", e.target.value)} placeholder="1234567890" className="pl-10" /></div>
                                </Champ>
                                <Champ label="Google Ads (facultatif)" aide="Identifiant de conversion Google Ads (AW-...).">
                                    <div className="relative"><img src="/logos/googleads.svg" alt="" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" /><Entree value={f.googleAdsId} onChange={(e) => maj("googleAdsId", e.target.value)} placeholder="AW-123456789" className="pl-10" /></div>
                                </Champ>
                            </div>
                        </div>
                    </Bloc>
                </div>

                <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
                    <div className="rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>Ce que verra votre client</p>
                        <div className="rounded-xl bg-white p-4 text-[#111]">
                            <p className="text-[11px] text-neutral-500">{session?.user?.name || "Votre boutique"}</p>
                            {images[0] ? (
                                <img src={images[0]} alt="" className="mt-2 w-full rounded-lg object-cover" style={{ aspectRatio: "4 / 3" }} />
                            ) : (
                                <div className="mt-2 grid w-full place-content-center rounded-lg bg-neutral-100 text-neutral-300" style={{ aspectRatio: "4 / 3" }}><Package className="h-7 w-7" /></div>
                            )}
                            <p className="mt-2 truncate text-base font-semibold">{f.title || "Titre de votre offre"}</p>
                            {f.description && <p className="mt-1 line-clamp-3 text-xs text-neutral-600">{f.description}</p>}
                            {f.amountFree ? (
                                <p className="mt-3 text-base font-semibold tracking-tight">Montant au choix{montant > 0 ? <span className="ml-1 text-xs font-normal text-neutral-500">suggéré {fmtMontant(montant)}</span> : null}</p>
                            ) : (
                                <p className="mt-3 text-2xl font-bold tracking-tight">{montant > 0 ? fmtMontant(montant) : "0 XOF"}{f.allowQuantity ? <span className="ml-1 text-xs font-normal text-neutral-500">x quantité</span> : null}</p>
                            )}
                            {fraisApercu && montant > 0 && !f.amountFree && <p className="text-[11px] text-neutral-500">+ {fraisPct} % de frais, soit {fmtMontant(Math.round(montant * (1 + (ctx?.fraisBps || 300) / 10000)))} à payer</p>}
                            <div className="mt-3 space-y-2">
                                <div className="h-9 rounded-lg bg-neutral-100 px-3 text-xs leading-9 text-neutral-400">{f.amountFree ? "Montant, nom et e-mail" : "Nom et e-mail"}{f.requestPhone ? ", téléphone" : ""}</div>
                                <div className="flex h-10 items-center justify-center rounded-lg bg-[#0b0b0c] text-sm font-semibold text-white">Payer {!f.amountFree && montant > 0 ? fmtMontant(montant) : ""}</div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">{OPERATEURS.map(([src, nom]) => <img key={nom} src={src} alt={nom} title={nom} className="h-5 w-5 object-contain" />)}</div>
                        </div>
                    </div>
                    <Aide>Le client paie avec les moyens activés dans <Link href="/methods" className="underline">Moyens de paiement</Link>. Le paiement est encaissé selon le mode de votre espace.</Aide>
                    <Bouton icone={Link2} chargement={occupe} onClick={creer} className="w-full">Créer le lien</Bouton>
                </div>
            </div>
        </Page>
    );
}
