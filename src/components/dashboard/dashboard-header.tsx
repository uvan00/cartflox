"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { Link2, ArrowRight } from "lucide-react";
import { Bouton } from "./kit";

/** En-tete de la vue d'ensemble : salutation, date, et les deux actions utiles. */
export function DashboardHeader() {
    const { data: session } = useSession();
    const [salut, setSalut] = useState("Bonjour");
    const [date, setDate] = useState("");

    useEffect(() => {
        const h = new Date().getHours();
        setSalut(h >= 18 ? "Bonsoir" : "Bonjour");
        setDate(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
    }, []);

    const prenom = session?.user?.name?.split(" ")[0] || "";

    return (
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
                <p className="text-xs font-medium capitalize" style={{ color: "var(--dt-text-muted)" }}>{date}</p>
                <h1 className="mt-0.5 text-2xl font-semibold tracking-tight" style={{ color: "var(--dt-text-primary)" }}>{salut}{prenom ? `, ${prenom}` : ""}</h1>
                <p className="mt-1 text-[13px]" style={{ color: "var(--dt-text-muted)" }}>Voici où en sont vos paiements.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Link href="/transactions"><Bouton variante="secondaire" icone={ArrowRight}>Voir les transactions</Bouton></Link>
                <Link href="/payment-links/new"><Bouton icone={Link2}>Créer un lien de paiement</Bouton></Link>
            </div>
        </div>
    );
}
