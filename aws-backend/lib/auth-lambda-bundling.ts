/**
 * Reusable esbuild bundling fix for any future NodejsFunction whose entry
 * point imports lambda/auth (directly or transitively) — i.e. anything
 * that pulls in firebase-admin/auth. Phase 4 Step 2.7.
 *
 * THE PROBLEM
 * -----------
 * firebase-admin/auth eagerly requires jwks-rsa at module load time (used
 * internally to verify externally-federated OIDC/SAML tokens — a feature
 * this project doesn't use anywhere, but the require() chain still runs
 * unconditionally the moment firebase-admin/auth is imported, regardless
 * of which function is actually called). jwks-rsa's own utils.js does
 * `const jose = require('jose')` at ITS top level, and every published
 * jwks-rsa 4.x release — the only major that satisfies firebase-admin's
 * own declared `"jwks-rsa": "^4.0.1"` dependency — pins `"jose": "^6.1.3"`.
 * jose dropped CommonJS support entirely at v6: its package.json
 * `exports` field has no `require` condition, only `default`/`import`.
 * On a Node runtime that lacks (or doesn't apply) the newer synchronous
 * require(esm) interop — which, per Step 2.7's testing, includes
 * whatever AWS Lambda's managed nodejs22.x runtime was doing when Step
 * 2.5 first hit this — requiring it crashes at Lambda cold start with:
 *
 *   Error [ERR_REQUIRE_ESM]: require() of ES Module
 *   .../node_modules/jose/dist/webapi/index.js from
 *   .../node_modules/jwks-rsa/src/utils.js not supported.
 *
 * That's the exact error Step 2.5 hit on the first real cdk deploy (see
 * PROJECT_SUMMARY.md), and the exact error Step 2.7 reproduced again on
 * purpose — this time locally, without needing a real deploy — by
 * bundling a throwaway entry point that imports lambda/auth with the
 * same esbuild flags this stack uses, then running the result with
 * `node --no-experimental-require-module` to force the same strict
 * behavior a runtime without that interop would have.
 *
 * THE FIX, AND WHY IT NEEDS TWO PARTS
 * ------------------------------------
 * jose 5.x is the last major with a `require` export condition, and
 * Step 2.7 confirmed (against the npm registry) that it still exports
 * every function jwks-rsa's code actually calls — importJWK, exportSPKI
 * — so pinning to it isn't just "stop crashing at import time", it's
 * also API-compatible if that code path were ever genuinely exercised.
 *
 * Two things have to be true at once for the pin to actually reach a
 * deployed bundle, not just this project's own local node_modules:
 *
 * 1. The "overrides" field in ../package.json — necessary for this
 *    project's own local dev environment (so a local `npm install`
 *    resolves jose to 5.x too), but NOT sufficient by itself.
 *    NodejsFunction's `nodeModules` bundling step writes its OWN
 *    minimal, synthetic package.json into the bundle output directory
 *    — containing only the explicitly-listed nodeModules packages, e.g.
 *    `{ "dependencies": { "firebase-admin": "14.2.0" } }` — and runs a
 *    fresh `npm install` against THAT file. It does not carry this
 *    project's own overrides field across (confirmed by reading
 *    aws-cdk-lib's own extractDependencies implementation). Without
 *    part 2 below, the deployed bundle would still resolve jose back to
 *    the broken 6.x line even with the override sitting correctly here.
 *
 * 2. commandHooks.afterBundling, below — runs after NodejsFunction's own
 *    nodeModules install already completed, adds the override directly
 *    to the bundle's own synthetic package.json via `npm pkg set`, then
 *    re-runs `npm install` so the resolver enforces it tree-wide. A
 *    simpler-looking alternative — `npm install jose@5.10.0` with no
 *    override involved — was tried and rejected during verification: npm
 *    resolves that direct request correctly, but ALSO leaves behind a
 *    nested node_modules/jwks-rsa/node_modules/jose shadow copy still
 *    pinned to 6.x, to satisfy jwks-rsa's own declared range — and
 *    Node's module resolution finds that nested copy first, so the
 *    crash persists. Going through npm's own overrides mechanism is
 *    what makes it rewrite the resolution tree-wide, with no shadow
 *    copy left behind.
 *
 * USAGE
 * -----
 * Any future NodejsFunction whose entry imports lambda/auth (directly or
 * transitively) needs this spread into its bundling config:
 *
 *   bundling: {
 *     nodeModules: ['firebase-admin'],
 *     forceDockerBundling: false,
 *     minify: true,
 *     sourceMap: true,
 *     target: 'node22',
 *     commandHooks: authLambdaCommandHooks,
 *   }
 *
 * Functions that don't import lambda/auth — like the existing
 * HealthFunction in aws-backend-stack.ts — don't need this.
 * firebase-admin/auth is never required, so jwks-rsa/jose never load, so
 * nothing crashes, override or not. Deliberately not applied to
 * HealthFunction here for exactly that reason: it isn't needed there,
 * and this step isn't meant to touch already-working functionality.
 *
 * VERIFIED (Step 2.7, this sandbox): real esbuild bundle of a throwaway
 * entry importing lambda/auth, CDK's real nodeModules install behavior
 * reproduced, this exact afterBundling fix applied, then run under
 * `node --no-experimental-require-module` — loads cleanly, no crash. See
 * PROJECT_SUMMARY.md and aws-backend/README.md for the full account,
 * including what remains unverified (a real `cdk deploy` to a live AWS
 * account, which this sandbox cannot do).
 */
import type { ICommandHooks } from 'aws-cdk-lib/aws-lambda-nodejs';

// Keep this in sync with the "overrides" entry in ../package.json.
const JOSE_CJS_COMPATIBLE_RANGE = '^5.10.0';

export const authLambdaCommandHooks: ICommandHooks = {
  beforeBundling(): string[] {
    return [];
  },
  beforeInstall(): string[] {
    return [];
  },
  afterBundling(_inputDir: string, outputDir: string): string[] {
    return [
      `cd "${outputDir}" && npm pkg set overrides.jose="${JOSE_CJS_COMPATIBLE_RANGE}" && npm install --no-audit --no-fund`,
    ];
  },
};
