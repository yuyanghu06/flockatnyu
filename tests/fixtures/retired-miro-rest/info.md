# Frozen historical Miro SQL fixtures

These copies preserve the JavaScript adapters needed to exercise the original applied SQL migrations in `miro-sql.test.mjs` and `schema-cleanup-sql.test.mjs`. They are test fixtures for historical schema contracts, not application modules. No production entrypoint may import them. The live application reads Miro content only through its MCP integration; the retired REST client, snapshot sync and tools here must not be revived as a runtime fallback.

The historical schema-cleanup-shared-access test also uses this frozen store because its migration stage predates the MCP-only runtime contract.
