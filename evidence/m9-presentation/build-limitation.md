# Build and runtime verification limitation

Command: npm run build (M8 integration, same workspace)
Result: exit 1. Vite transformed 7 modules, then plugin vite:asset-import-meta-url
failed with EPERM: operation not permitted, realpath
C:/Users/Yuyang Hu/Documents/techatnyu/techvisualized/campus-assets/models/environment/streets-parks.glb

This existing asset was not modified by M8/M9. No permission workaround or
configuration change was used to bypass the error. Final M9 source syntax and
independent checks pass; the final production build was not repeated after the
same unresolved access failure. Browser access was denied. User independently
reported GCASL looked good live; no M9 live visual approval has been recorded.
