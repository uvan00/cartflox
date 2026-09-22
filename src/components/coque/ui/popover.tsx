"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@/lib/utils";

/** Bulle flottante shadcn (Base UI) : sert de support au calendrier. */
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
    return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
    return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({ className, align = "center", sideOffset = 6, ...props }: React.ComponentProps<typeof PopoverPrimitive.Popup> & { align?: "start" | "center" | "end"; sideOffset?: number }) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50">
                <PopoverPrimitive.Popup
                    data-slot="popover-content"
                    className={cn(
                        "w-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-md outline-hidden",
                        "origin-[var(--transform-origin)] transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                        className,
                    )}
                    {...props}
                />
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}

export { Popover, PopoverTrigger, PopoverContent };
