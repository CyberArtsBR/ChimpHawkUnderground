# Deploying to Cloudflare (Workers static assets)

Cloudflare serves static files with no bandwidth limit on the free plan. Its one hard limit is **25 MB per file**. After the Phase 0 asset diet, the largest shipped file is about 14 MB, so the game fits.

## One-time setup (owner) — Workers "Create an app" flow

Cloudflare's dashboard now creates a **Worker with static assets** (successor to Pages; same free, unlimited static traffic). `wrangler.jsonc` in the repo root tells it to serve `./dist`.

1. Create a free account at https://dash.cloudflare.com (sign-up must be done by you).
2. **Workers & Pages → Create → Import a repository**, authorise GitHub, choose `CyberArtsBR/StreetSkate`.
3. Settings:
   - Project name: `streetskate` (must match `name` in `wrangler.jsonc`)
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Preview command: `npx wrangler versions upload` (default is fine)
4. Click **Deploy**. Builds use the repo's default branch (`main`). Until Phase 0 is merged, `main` has no `wrangler.jsonc` and contains a 50 MB file, so **that first build is expected to fail**.
5. In the Worker: **Settings → Build → Branch control**:
   - either set the production branch to `phase0-asset-diet` for now,
   - or keep `main` and turn on **builds for non-production branches** to get a preview URL for `phase0-asset-diet`.
   Then **Deployments → Retry/Redeploy**.
6. The game will be live at `https://streetskate.<your-subdomain>.workers.dev`.

**Current live address:** https://chimphawk.pages.dev (Cloudflare Pages project `chimphawk`, branch `phase0-asset-diet`, build `npm run build`, output `dist`, `NODE_VERSION=22`).
7. Optional: **Settings → Domains & Routes** → add your own domain (free SSL).

After the Phase 0 PR is merged into `main`, set the production branch back to `main`. Every push then redeploys automatically.

## What's already in the repo

- `public/_headers`: cache rules. Hashed JS/CSS bundles are cached forever. Models, audio and media are cached for a day and refresh in the background. Pre-gzipped `.gz` models are marked so the CDN doesn't re-encode them.
- `.nvmrc`: Node 22.

## Moving off Render

Keep Render running until the Cloudflare URL has been tested. Then, in the Render dashboard, turn off auto-deploy or delete the `streetskate` service. `render.yaml` can stay in the repo; Cloudflare ignores it.

The CI release tools in `tools/agent10-*` default to `streetskate.onrender.com`. Set `AGENT10_ALLOWED_DEPLOY_HOST` to the new host if you keep using them.

## Later: Cloudflare R2 for big assets

When v2 adds more maps, move `public/assets` to an R2 bucket (10 GB free, no download fees) and point `gameAssetUrl()` in `src/game/AssetPaths.js` at the bucket URL. This isn't needed yet.
