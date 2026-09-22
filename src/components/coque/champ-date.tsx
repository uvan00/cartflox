"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/coque/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/coque/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Un champ de date : le bouton montre la date choisie, le calendrier s'ouvre
 * dessous. Remplace `<input type="date">`, dont l'apparence dependait du
 * navigateur et restait claire en theme sombre.
 *
 * La valeur reste au format AAAA-MM-JJ, comme avant : aucun appelant a changer.
 */
const versDate = (v?: string) => {
    if (!v) return undefined;
    const [a, m, j] = v.split("-").map(Number);
    return Number.isFinite(a) && Number.isFinite(m) && Number.isFinite(j) ? new Date(a, m - 1, j) : undefined;
};
const versTexte = (d?: Date) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

export function ChampDate({ value, onChange, min, max, placeholder = "Choisir une date", className, taille = "default", disabled }: {
    value?: string;
    onChange: (v: string) => void;
    min?: string;
    max?: string;
    placeholder?: string;
    className?: string;
    taille?: "sm" | "default";
    disabled?: boolean;
}) {
    const [ouvert, setOuvert] = useState(false);
    const choisie = versDate(value);
    const bas = versDate(min);
    const haut = versDate(max);

    return (
        <Popover open={ouvert} onOpenChange={setOuvert}>
            <PopoverTrigger
                render={<button type="button" disabled={disabled} className={cn(
                    "inline-flex items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50",
                    taille === "sm" ? "h-9" : "h-10", className,
                )} />}>
                <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className={cn("truncate", !choisie && "text-muted-foreground")}>
                    {choisie ? choisie.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : placeholder}
                </span>
            </PopoverTrigger>
            <PopoverContent align="start">
                <Calendar
                    mode="single"
                    selected={choisie}
                    defaultMonth={choisie}
                    disabled={[...(bas ? [{ before: bas }] : []), ...(haut ? [{ after: haut }] : [])]}
                    onSelect={(d) => { if (d) { onChange(versTexte(d)); setOuvert(false); } }}
                />
            </PopoverContent>
        </Popover>
    );
}
