import { redirect } from "next/navigation";

/** Maquette (boutons sans action, promesses inventees) : la vraie documentation est servie sur /docs. */
export default function AncienneDocumentation() {
    redirect("/docs");
}
