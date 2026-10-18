# Project-derived campus assets

`models/buildings/` preserves the extracted John A. Paulson Center source model.
`models/environment/` contains baked street/park and park vegetation GLBs.
[data/](data/info.md) records placement, source attribution and bake metadata.

These files share the original export's Washington Square coordinates, meters and
Y-up convention. Placement instructions for the extracted Paulson model remain in
the metadata. Runtime procedural replacements and selectable details live in `src/`;
moving asset paths does not change their geometry or selection grouping.
