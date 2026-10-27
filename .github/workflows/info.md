# Workflows

`ci.yml` provides quality and browser checks and can be reused by release jobs.
`release.yml` builds five source-only packages for one checked main commit.
Production deployment and database migrations remain explicit operator actions.
