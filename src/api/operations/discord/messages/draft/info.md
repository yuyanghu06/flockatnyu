# Private operation handlers

This folder groups server-only operation handlers for `/api/operations/discord/messages/draft`.
Each method file explains its purpose, arguments and permissions. The operation
router is private and never mounted by the public website. Handlers call their
bound server service; adding a file grants no new model or source capability.
