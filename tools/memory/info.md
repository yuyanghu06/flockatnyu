# Shared memory tools

`index.js` exposes read_memory and update_memory to chat. Every request first
loads the same short shared text note, which is injected into planning and answer
prompts as background data. Updates replace the complete merged text with an
optimistic timestamp check. Core instructions remain in code. No per-user memory,
embeddings, source archives, histories or extra maintenance job are introduced.
