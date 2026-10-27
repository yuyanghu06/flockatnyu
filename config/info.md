# Shared quality policy

`file-limits.json` sets the physical line limits for authored JavaScript and CSS.
Its explicit legacy entries freeze the four oversized files already present
before cleanup. The checker rejects growth, new oversized files and stale entries.
Never regenerate these maxima merely to pass CI; split the file instead.
