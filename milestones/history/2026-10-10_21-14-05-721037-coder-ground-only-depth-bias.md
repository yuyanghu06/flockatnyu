# ground-only-depth-bias

- Local timestamp / acting role / milestone: 2026-10-10T21:14:05.7210376-04:00 / coder / M7.
Restored the standard renderer depth pipeline. Applied polygon offset factor 1 and units 4 only to the background ground material, preserving all architecture shaders and camera settings. Retained baked asphalt cutouts beneath crossings. Build passed; independent ground-bias motion and performance retest is pending.
