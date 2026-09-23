import { redirect } from "next/navigation";

/** Maquette (listes statiques, succes annonce sans rien faire) : les moyens s'activent sur la page Moyens de paiement. */
export default function AncienneMaquette() {
    redirect("/methods");
}
