import { redirect } from "next/navigation";

/** La racine mene au tableau de bord ; sans session, le proxy renvoie a la connexion. */
export default function Racine() {
    redirect("/dashboard");
}
