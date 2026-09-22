"use client";

import createGlobe from "cobe";
import { useEffect, useRef } from "react";

export function WorldGlobe() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let phi = 0;

        if (!canvasRef.current) return;

        const globe = createGlobe(canvasRef.current, {
            devicePixelRatio: 2,
            width: 600 * 2,
            height: 600 * 2,
            phi: 0,
            theta: 0,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.3, 0.3, 0.3],
            markerColor: [0.1, 0.8, 1],
            glowColor: [1, 1, 1],
            markers: [
                // Africa (Major Hubs - Highlighting coverage)
                { location: [5.3600, -4.0083], size: 0.1 }, // Abidjan (Larger)
                { location: [14.7167, -17.4677], size: 0.08 }, // Dakar
                { location: [6.5244, 3.3792], size: 0.08 }, // Lagos
                { location: [5.6037, -0.1870], size: 0.06 }, // Accra
                { location: [3.8480, 11.5021], size: 0.06 }, // Yaoundé
                { location: [-4.4419, 15.2663], size: 0.06 }, // Kinshasa
                { location: [-1.2921, 36.8219], size: 0.08 }, // Nairobi
                { location: [-26.2041, 28.0473], size: 0.08 }, // Johannesburg
                { location: [30.0444, 31.2357], size: 0.08 }, // Cairo
                { location: [34.0209, -6.8416], size: 0.06 }, // Rabat
                { location: [12.6392, -8.0029], size: 0.06 }, // Bamako
                { location: [12.3714, -1.5197], size: 0.06 }, // Ouagadougou
                { location: [6.1428, 1.2254], size: 0.06 }, // Lomé
                { location: [6.3667, 2.4333], size: 0.06 }, // Cotonou

                // Europe (Connections)
                { location: [48.8566, 2.3522], size: 0.05 }, // Paris
                { location: [51.5074, -0.1278], size: 0.05 }, // London
                { location: [52.5200, 13.4050], size: 0.05 }, // Berlin
                { location: [40.4168, -3.7038], size: 0.05 }, // Madrid

                // Americas (Global Reach)
                { location: [40.7128, -74.0060], size: 0.08 }, // NYC
                { location: [34.0522, -118.2437], size: 0.05 }, // LA
                { location: [19.4326, -99.1332], size: 0.05 }, // Mexico City
                { location: [-23.5505, -46.6333], size: 0.07 }, // Sao Paulo
                { location: [43.6532, -79.3832], size: 0.05 }, // Toronto

                // Asia & Middle East (Global Reach)
                { location: [25.2048, 55.2708], size: 0.07 }, // Dubai
                { location: [19.0760, 72.8777], size: 0.06 }, // Mumbai
                { location: [1.3521, 103.8198], size: 0.06 }, // Singapore
                { location: [35.6762, 139.6503], size: 0.05 }, // Tokyo
                { location: [31.2304, 121.4737], size: 0.06 }, // Shanghai
            ],
            onRender: (state) => {
                // Called on every animation frame.
                // `state` will be an empty object, return updated params.
                state.phi = phi;
                phi += 0.003; // Smooth rotation
            },
        });

        return () => {
            globe.destroy();
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: 600, height: 600, maxWidth: "100%", aspectRatio: 1 }}
        />
    );
}
