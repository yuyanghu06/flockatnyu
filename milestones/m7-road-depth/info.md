# M7: Road flicker during zoom and pan

Completed: bias only the background ground plane behind roads with polygon
 offset (factor 1, units 4), and cut crossing footprints out of asphalt rather
than leaving asphalt eight millimeters below crossing surfaces. Standard depth,
camera settings, free controls, palettes and building materials are preserved.

Independent testing passed seven checks and captured 48 motion frames across
close and wide views. Roads stayed stable in sampled zooms and micro-pans;
selection, camera bounds and mobile layout passed without missing assets/errors.
Independent review confirmed clean street faces and no added roof stippling.
The initial global logarithmic-depth candidate was rejected for roof artifacts.

Current desktop sample is approximately 60 FPS; a historical 165 FPS sample is
not directly comparable, and both revised depth configurations measured 60 FPS.
The original intermittent flicker was not strongly reproduced in baseline frames,
so this is a targeted source fix with sampled validation, not an all-device guarantee.
Evidence: ../../evidence/m7-road-depth/. Preview: http://127.0.0.1:4173/.
