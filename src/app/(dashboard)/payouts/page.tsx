import { redirect } from "next/navigation";

/**
 * Cartflox ne detient plus les fonds des marchands : chacun encaisse avec ses
 * propres cles d'agregateurs, l'argent arrive directement chez lui. Il n'y a
 * donc plus ni solde ni reversement a gerer.
 */
export default function Page() {
    redirect("/transactions");
}
