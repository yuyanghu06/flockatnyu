# Local tools

`extract-paulson-center.mjs` reproduces the previously extracted building from the
original source scene (not included in this checkout). It preserves the source.
`journal-pass.ps1` appends timestamped development records on Windows; shared
journal writes belong to the orchestrator.

M6: fetch-streets-parks.py retrieves attributed OSM geometry (--reuse regenerates from cached raw evidence); build-streets-parks.mjs generates the runtime GLB and metadata. inspect-park-bounds.mjs checks existing scenery datums.
