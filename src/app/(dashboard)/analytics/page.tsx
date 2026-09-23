import { redirect } from "next/navigation";

/** Page orpheline (montants toutes devises confondues) : les statistiques font foi. */
export default function AncienneUsage() {
    redirect("/statistics");
}
