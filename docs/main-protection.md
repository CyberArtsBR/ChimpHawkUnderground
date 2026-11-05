# StreetSkate — main protection / production workflow

Release update (2026-10-07): the user explicitly requested the Phase 1 merge and production deploy without further tests. That instruction supersedes the pre-merge recommendations below for this release. `npm run build` now compiles only; validation remains separately available through `npm run validate` and the existing CI workflow.

Phase 1 cannot apply GitHub branch protection through the connected GitHub App because the integration does not have repository administration permission.

Observed on 2026-10-07:

- `main` SHA: `b9d657ad813975857219dab37089dd2ec96ccb24`
- GitHub reports `protected: false`
- repository rulesets endpoint returns no rulesets
- production Render service: `streetskate`
- production Render branch: `main`
- Phase 1 staging Render service: `streetskate-phase1-staging`
- staging branch: `refactor/core-skate-controller-v1`

## Recommended GitHub ruleset

Open:

**Repository Settings → Rules → Rulesets → New branch ruleset**

Use:

- Ruleset name: `StreetSkate production main`
- Enforcement status: **Active**
- Target branches: **Include default branch** or branch name pattern `main`

Recommended rules:

1. **Restrict deletions**
2. **Block force pushes**
3. **Require a pull request before merging**
   - required approvals: 0 or 1 depending on whether solo development must remain possible
   - dismiss stale approvals: optional
4. **Require status checks to pass**
   - `validate-core`
   - `browser-smoke`
5. **Require branches to be up to date before merging**
6. **Require conversation resolution before merging** if PR review is used
7. Do **not** require signed commits unless the repository is already configured for signing.
8. Keep an **owner/admin bypass** available so the repository cannot be accidentally locked during solo development.

## Development workflow

Production:

`main`
→ GitHub required checks
→ Render `streetskate`
→ https://streetskate.onrender.com

Phase 1 / feature work:

feature or refactor branch
→ Phase 1 Core CI
→ Render staging
→ browser/manual gameplay validation
→ pull request
→ merge only after acceptance

Current Phase 1 branch:

`refactor/core-skate-controller-v1`

Current staging:

https://streetskate-phase1-staging.onrender.com

## Render policy

Keep production Render tied only to `main`.

Do not point the production service at a development branch.

The staging service may auto-deploy the Phase 1 branch because it is isolated from production.

## Merge gate

Do not merge Phase 1 while any of these are unresolved:

- `validate-core` is not green
- `browser-smoke` is not green
- staging does not load the original production arena
- `halfpipenew.glb` is loaded unexpectedly
- passive vert return changes heading without explicit spin
- visible collision/clipping regressions remain in manual staging playtest
- camera vert reversal is unacceptable in manual staging playtest
