"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Calendrier shadcn (react-day-picker), en francais et aux couleurs du theme :
 * il remplace le champ `type="date"` du navigateur, dont l'apparence change
 * d'un navigateur a l'autre et qui restait blanc en theme sombre.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
    return (
        <DayPicker
            locale={fr}
            showOutsideDays={showOutsideDays}
            className={cn("p-1", className)}
            classNames={{
                months: "flex flex-col sm:flex-row gap-4",
                month: "flex flex-col gap-3",
                month_caption: "flex h-9 items-center justify-center px-9",
                caption_label: "text-sm font-medium capitalize",
                nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between px-1",
                button_previous: "inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
                button_next: "inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
                month_grid: "w-full border-collapse",
                weekdays: "flex",
                weekday: "w-9 text-[11px] font-normal text-muted-foreground",
                week: "mt-1 flex w-full",
                day: "relative size-9 p-0 text-center text-sm",
                day_button: "inline-flex size-9 items-center justify-center rounded-lg font-normal hover:bg-accent hover:text-accent-foreground aria-selected:opacity-100",
                selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
                today: "[&>button]:border [&>button]:border-primary",
                outside: "text-muted-foreground/50",
                disabled: "text-muted-foreground/40",
                range_middle: "[&>button]:bg-accent [&>button]:text-accent-foreground [&>button]:rounded-none",
                range_start: "[&>button]:rounded-r-none",
                range_end: "[&>button]:rounded-l-none",
                hidden: "invisible",
                ...classNames,
            }}
            components={{
                Chevron: ({ orientation, ...rest }) =>
                    orientation === "left" ? <ChevronLeftIcon className="size-4" {...rest} /> : <ChevronRightIcon className="size-4" {...rest} />,
                ...props.components,
            }}
            {...props}
        />
    );
}

export { Calendar };
