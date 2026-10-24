# Render Blueprint Requirements (not a deployable YAML by itself)

This file is a contract for the generated repository's root `render.yaml`. The prompt kit intentionally does not include a fake Blueprint pointing to application files that do not exist yet.

The coding agent must create a root-level `render.yaml` after implementing the actual repository. It must:
- Define web, API (if separate), worker, and managed PostgreSQL resources that really exist in the codebase.
- Use build/start commands that are present in package scripts or valid Docker contexts.
- Define correct health check paths and use the correct port binding.
- Pass secrets through environment variables with `sync: false`; do not store actual secrets.
- Reference the managed database using Render's supported connection string/property syntax.
- Run migrations safely as a supported pre-deploy/release step, not on each request.
- Keep the worker's scheduling responsibility separate from the web process.
- Document which services require always-on capacity for reliable jobs.
- Be validated against the current official specification: https://render.com/docs/blueprint-spec

Do not declare the application deployable until a clean Render Blueprint review and deployment/smoke test have been completed.
