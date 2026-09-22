"use client";

import { useRouter } from "next/navigation";
import { goeyToast } from "goey-toast";
import { NouvelEspaceForm } from "@/components/espaces/nouvel-espace-form";
import { createApplication } from "@/lib/actions/applications";

/** Ouverture d'un espace classique : le marchand branchera ses propres passerelles. */
export default function NewApplicationPage() {
    const router = useRouter();
    return (
        <NouvelEspaceForm variante="classique" premier retourHref="/dashboard"
            creer={async ({ nom, site, secteur }) => {
                const res = await createApplication(nom, site, secteur);
                if (!res.success) return res.error || "Erreur lors de la création";
                goeyToast.success("Espace créé");
                if (res.data) {
                    localStorage.setItem("currentAppId", res.data.id);
                    document.cookie = `applicationId=${res.data.id}; path=/; max-age=31536000`;
                }
                router.push("/dashboard?bienvenue=1");
                router.refresh();
                return null;
            }} />
    );
}
