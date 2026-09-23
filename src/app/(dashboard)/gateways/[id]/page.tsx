import { redirect } from "next/navigation";

/**
 * Ancienne page d'edition PayDunya : trois champs qui n'etaient pas ceux des
 * autres fournisseurs, secrets renvoyes au navigateur, configuration reecrite
 * a l'enregistrement, chiffres inventes. Le tiroir de la page Passerelles fait
 * tout cela correctement.
 */
export default function AnciennePagePasserelle() {
    redirect("/gateways");
}
