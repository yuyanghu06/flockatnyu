# Deployment assets

This folder contains reviewed deployment inputs for services in this repository.
The Discord worker uses its own minimal Docker build context prepared by
`tools/prepare-discord-deploy.mjs`; it does not inherit the campus map or API
Railway configuration. Service IDs and observed launch status live in the
milestone and launch guide. Credentials belong in local ignored environment
files or Railway service variables.
