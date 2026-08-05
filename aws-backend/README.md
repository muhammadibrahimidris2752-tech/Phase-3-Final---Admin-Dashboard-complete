# aws-backend — Phase 4 Steps 2.5–2.8 (AWS proof-of-concept)

This is a **parallel, standalone backend**, built to validate whether
AWS Lambda + API Gateway can replace `functions/` (the Firebase Cloud
Functions backend from Phase 4 Steps 1–2). It does not touch, depend
on, or replace anything in `functions/`, the frontend, or Firebase
Hosting — both backends currently exist side by side, and `functions/`
remains the one actually wired to anything.

**Scope, deliberately minimal:** two endpoints. `GET /health/{zoneId}`
(Step 2.5) reads one document from Firestore's existing
`deliveryZones` collection and returns it as JSON. `GET
/health/auth-check` (Step 2.8) verifies a real Firebase ID token via
`requireOwner()` and returns `{ ok: true, uid }` — nothing about the
business it's protecting, just proof the auth path itself works,
including on the real Lambda runtime (see Step 2.7/2.8 in
`PROJECT_SUMMARY.md` for why that needed its own step). Nothing about
checkout, Paystack, orders, or emails is implemented here yet — see
`lambda/payments/`, `lambda/orders/`, `lambda/email/` for placeholders
describing what would move here in later steps, *if* this
proof-of-concept is confirmed working and a decision is made to
proceed.

## Architecture

```
API Gateway (HTTP API)  --->  Lambda (Node.js 22, TypeScript)  --->  Firestore
      GET /health/{zoneId}         reads Firebase service account         (via Firebase
                                    from AWS Secrets Manager,               Admin SDK)
                                    initializes Firebase Admin SDK
                                    once per warm execution

      GET /health/auth-check  ---> same Secrets Manager / Admin SDK  ---> Firestore
                                    setup, in a SEPARATE Lambda            (admins/{uid},
                                    (AuthCheckFunction) — verifies the     via Admin SDK)
                                    caller's Firebase ID token first
```

Two separate Lambda functions, not one handling both routes — see
"`lambda/auth/` is deliberately isolated" below for why that separation
is load-bearing, not just tidiness.

Everything is provisioned by CDK (`lib/aws-backend-stack.ts`) **except
one thing**: the Secrets Manager secret's actual *value*. Creating the
secret is automatable, but populating it with your real Firebase
service account key is left as a deliberate manual step, so that key
is never captured in CloudFormation state, `cdk diff` output, or
version control.

## One-time setup

### 1. Generate a Firebase service account key

Firebase Console → Project Settings → Service Accounts →
**Generate New Private Key**. This downloads a JSON file — treat it
like a root credential to your Firestore database. Don't rename it,
reformat it, or extract individual fields from it for the next step;
use the whole file as-is.

### 2. Create the Secrets Manager secret (the one manual AWS step)

```bash
aws secretsmanager create-secret \
  --name kitchen-home-by-noor/firebase-service-account \
  --description "Firebase service account key for the aws-backend Lambda (Phase 4 Step 2.5)" \
  --secret-string file:///path/to/the/downloaded-key.json \
  --region eu-west-1
```

The secret's **name** must exactly match
`FIREBASE_SERVICE_ACCOUNT_SECRET_NAME` in `lambda/config.ts` (already
set to `kitchen-home-by-noor/firebase-service-account` — change it in
that one file, not here, if you'd rather use a different name). The
**region** must match the region this stack deploys to (`eu-west-1` by
default — see `bin/aws-backend.ts`).

Once this secret exists, you never touch it again from the CDK
side — `cdk deploy` only ever *references* it by name and grants the
Lambda read access; it never creates, modifies, or displays its value.

### 3. AWS CLI credentials

Standard `aws configure` (or an SSO profile) with permissions to
create Lambda functions, API Gateway HTTP APIs, IAM roles, CloudWatch
Log Groups, and read the Secrets Manager secret above. If you haven't
bootstrapped CDK in this AWS account/region before, run
`npx cdk bootstrap` once first — the deploy step below will tell you
if this is needed.

## Deployment workflow

```bash
cd aws-backend
npm install      # installs both CDK and Lambda runtime dependencies —
                  # this is one project, one package.json (see README
                  # note below on why)
npm run build     # tsc type-check across bin/, lib/, and lambda/ — a
                  # fast correctness gate before synth/deploy re-does
                  # its own (separate) TypeScript handling
npm run lint       # ESLint
npm run synth       # renders the CloudFormation template to cdk.out/
                     # without deploying anything — good for reviewing
                     # exactly what will be created first
npm run deploy        # actually creates/updates the AWS resources
```

`cdk deploy` prints an `ApiUrl` output when it finishes — that's your
base URL.

### Docker is not required

`npm install` installs `esbuild` as a devDependency specifically so
`NodejsFunction` bundles the Lambda locally. Without a locally
resolvable `esbuild`, CDK silently falls back to bundling inside a
Docker container instead — which fails outright (`spawnSync docker
ENOENT`) on any machine without Docker installed, this environment
included. If `npm run synth`/`npm run deploy` ever mentions Docker
after a clean `npm install`, something's wrong with the local `esbuild`
install, not a missing Docker requirement — this project is set up to
never need it.

## Testing the deployed endpoint

```bash
curl https://<ApiUrl>/health/sample-zone-within-city
```

Use a real delivery zone document ID from your Firestore — the sample
IDs seeded in Phase 4 Step 1 (`sample-zone-within-city`,
`sample-zone-same-state`, `sample-zone-other-states`) work if you
haven't replaced them yet via the Admin Dashboard's Delivery Zones
page, or use the real Firestore-generated ID of any zone you've since
added there.

Expected responses:
- **200** — `{ "id": "...", "name": "...", "fee": ..., ... }`
- **404** — `{ "error": { "code": "NOT_FOUND", "message": "..." } }` for an id that doesn't exist
- **400** — if you hit `/health/` with no id at all

### Testing `/health/auth-check` (Step 2.8)

Needs a real Firebase ID token from an account with an
`admins/{uid}` Firestore document where `active: true` and
`role: 'owner'` — the same bar the Admin Dashboard itself already
requires, so any account that can sign into it today already
qualifies. Easiest way to get one: from the browser console while
signed into the Admin Dashboard, reusing the exact CDN URL the page
itself already loads (`js/firebase.js`'s `FIREBASE_SDK_VERSION`) so
this picks up the already-initialized app rather than starting a new,
signed-out one:

```js
const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
const token = await getAuth().currentUser.getIdToken();
copy(token); // Chrome DevTools — copies it to the clipboard
```

Then:

```bash
curl -H "Authorization: Bearer <token>" https://<ApiUrl>/health/auth-check
```

Expected responses:
- **200** — `{ "ok": true, "uid": "..." }`
- **401** — missing/malformed header, or an expired token (they're
  short-lived — get a fresh one and retry)
- **403** — a valid token, but that account isn't an active owner in
  `admins/{uid}`

Any clean JSON response here — even a 401 or 403 — is the real
confirmation this endpoint exists to get: it means the Lambda's bundle
survived cold start on the real runtime with `firebase-admin/auth`
actually imported, which is what Step 2.7's fix was for. A 502 or a
generic Lambda platform error, instead of JSON, would mean the fix
didn't hold on the real runtime the way local testing predicted — see
`PROJECT_SUMMARY.md`'s Step 2.8 section for exactly what was and
wasn't verified locally.

## Local testing without deploying

CDK doesn't include a built-in local Lambda invoker the way the
Firebase emulator does for `functions/`. Two practical options:

- **`cdk synth`** — confirms the stack synthesizes correctly (catches
  most CDK-level mistakes) without touching AWS at all.
- **Deploy once, then iterate against the real thing** — for a
  two-endpoint proof-of-concept, this is usually faster than
  standing up a local Lambda Runtime Interface Emulator. If you'd
  rather test locally before every deploy as this grows, look at
  [AWS SAM Local](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local.html)
  or the Lambda Runtime Interface Emulator directly — neither is set
  up in this proof-of-concept, since it's genuinely still small.

## Why one `package.json` for both CDK and Lambda code

AWS's own `NodejsFunction` construct documentation recommends exactly
this: one `package.json` covering both your CDK dependencies
(`aws-cdk-lib`, `constructs`) and your Lambda runtime dependencies
(`firebase-admin`, `@aws-sdk/client-secrets-manager`), with
infrastructure code (`bin/`, `lib/`) and application code (`lambda/`)
still cleanly separated by folder. `npm install` once, at the project
root, sets up everything needed for `synth`/`deploy`/`build`/`lint`.

## `lambda/auth/` is deliberately isolated from `/health`'s bundle

`lambda/admin.ts` only initializes Firestore (`firebase-admin/app` +
`firebase-admin/firestore`) — it does **not** initialize
`firebase-admin/auth`, even though `lambda/auth/verify-token.ts` needs
it. This isn't an oversight: `firebase-admin/auth` transitively depends
on `jwks-rsa`, which (in the versions currently resolved through
`firebase-admin`'s own dependency tree) requires `jose` — a package
that dropped CommonJS support entirely from v6 onward. The first
deploy of this project imported `firebase-admin/auth` from
`lambda/admin.ts` (used by every handler, including `/health`), which
pulled that broken `require()` chain into `/health`'s bundle and
crashed the Lambda at cold start, before the handler ever ran
(`ERR_REQUIRE_ESM`) — see `PROJECT_SUMMARY.md` for the full
investigation.

Step 2.5's fix: `firebase-admin/auth` is only imported inside
`lambda/auth/verify-token.ts`, which obtains its own `Auth` instance
from the shared `app` (`getAuth(app)`, cached internally by the Admin
SDK — no extra caching needed here). Since `/health`'s handler never
imports anything under `lambda/auth/`, esbuild's tree-shaking means
that broken dependency chain never enters its bundle at all. That was
always a way of *avoiding* the crash for one endpoint, not a fix for
it — Step 2.5 and Step 2.6 both flagged that whichever future step
first wired `requireOwner()`/`requireStaff()` into a real endpoint
would hit the identical crash in that endpoint's own bundle.

**Step 2.7 resolved the underlying incompatibility** — see
`PROJECT_SUMMARY.md`'s Step 2.7 section for the full investigation,
including two false starts worth reading before touching this again.
Short version: `jose` 5.x is the last major with CommonJS support, and
still exports everything `jwks-rsa`'s code calls, so it's a safe pin —
but *where* the pin lives matters. It can't live in this project's own
`package.json` (tried, reverted — it breaks `HealthFunction`'s own
`cdk synth` via `npm ci`, since `NodejsFunction`'s `nodeModules`
install step writes its own minimal `package.json` that doesn't carry
the project's `overrides` field, but *does* copy the real,
now-inconsistent lockfile alongside it). It lives instead in
`lib/auth-lambda-bundling.ts`, as a `commandHooks.afterBundling` hook
scoped to only the specific function that needs it — see that file's
header comment for the full mechanism. Any future `NodejsFunction`
whose entry imports `lambda/auth`, directly or transitively, needs
`commandHooks: authLambdaCommandHooks` added to its `bundling` config,
alongside the same `nodeModules: ['firebase-admin']` options
`HealthFunction` already uses. `HealthFunction` itself doesn't need
it and doesn't have it — it still never imports `firebase-admin/auth`.

Before wiring a real endpoint's `bundling` config by hand, run
`./scripts/verify-auth-bundle.sh path/to/your/entry.ts` first — it
bundles your entry through a real, throwaway `cdk synth` (not an
approximation of one) and confirms it loads without the
`ERR_REQUIRE_ESM` crash before you spend a deploy cycle finding out.
It doesn't call Firestore or AWS, so a clean pass here still isn't the
same as a confirmed real deploy.

**Step 2.8 gave the fix its first real consumer** —
`lambda/health/auth-check-handler.ts`, wired as a second, separate
`NodejsFunction` (`AuthCheckFunction`) with `commandHooks:
authLambdaCommandHooks` in its `bundling` config, per the usage note
above. `/health/{zoneId}`'s own `HealthFunction` is untouched by this
— still doesn't import `lambda/auth`, still doesn't need the fix, and
its synthesized bundle is byte-for-byte identical to before Step 2.8
(confirmed by comparing content-addressed asset hashes, not just
reading the unchanged source). The isolation this heading refers to
is specifically about `/health/{zoneId}`'s bundle, not about
`lambda/auth/` being unused — it's a working, exercised module now,
just still walled off from the one endpoint that never needed it. See
`PROJECT_SUMMARY.md`'s Step 2.8 section for what running the real,
permanent (not throwaway) `AuthCheckFunction` bundle under
`node --no-experimental-require-module` confirmed, and — just as
importantly — exactly what's still unconfirmed until a real
`cdk deploy` happens against a real AWS account.

## Project structure

```
aws-backend/
  bin/aws-backend.ts        CDK app entry point
  lib/aws-backend-stack.ts   CDK stack: Lambda, HTTP API, IAM (via grantRead),
                             Secrets Manager reference, CloudWatch Log Group
  lib/auth-lambda-bundling.ts Step 2.7 — commandHooks fix for the jose/
                             jwks-rsa crash. Used by AuthCheckFunction
                             (Step 2.8); not used by HealthFunction,
                             which doesn't need it. Full rationale in
                             its header.
  scripts/verify-auth-bundle.sh  Step 2.7 — bundles a given entry point
                             through a real, throwaway cdk synth and
                             checks it loads without the ERR_REQUIRE_ESM
                             crash. Used during Step 2.8's own
                             development; run it again before wiring
                             any future auth-gated endpoint by hand.
  lambda/
    config.ts                 Centralized configuration — single source
                               of truth for both the Lambda code and the
                               CDK stack (which imports the same constants)
    admin.ts                   Firebase Admin SDK singleton, cached across
                               warm invocations, credentials from Secrets Manager
    shared/                    Cross-cutting helpers: structured logging,
                               centralized error types, centralized HTTP
                               response shaping
    auth/                       Firebase ID token verification —
                               requireOwner()/requireStaff(), mirroring
                               functions/src/utils/auth.ts exactly. Used
                               by health/auth-check-handler.ts (Step 2.8);
                               still not used by health/handler.ts
    delivery/                   getDeliveryZoneById() — the Firestore read
                               /health is built on, kept reusable for real
                               delivery-fee-calculation logic later
    payments/, orders/, email/   Empty placeholders — where the
                               corresponding functions/src/ modules would
                               migrate to, if this proof-of-concept is
                               confirmed and that decision is made
    health/
      handler.ts                  GET /health/{zoneId} — Step 2.5's proof
                               the Firestore pipeline works. Never imports
                               lambda/auth; HealthFunction's bundling has
                               no commandHooks fix and doesn't need one
      auth-check-handler.ts       GET /health/auth-check — Step 2.8's
                               proof the Step 2.7 fix works on a real,
                               deployed Lambda. Separate file/function
                               from handler.ts on purpose — see "lambda/
                               auth/ is deliberately isolated" above
```

## Relationship to `functions/`

Nothing here modifies, depends on, or was generated from `functions/`.
The two are intentionally parallel:

| | `functions/` (Phase 4 Steps 1–2) | `aws-backend/` (this step) |
|---|---|---|
| Compute | Firebase Cloud Functions v2 | AWS Lambda |
| Entry point | `onCall`/`onRequest`, auth context automatic | API Gateway event, auth verified explicitly |
| Firebase Admin SDK credentials | Automatic (Application Default Credentials) | Explicit service account key, from Secrets Manager |
| Secrets | Firebase Secret Manager (`defineSecret`) | AWS Secrets Manager |
| Status | Deployed, `healthCheck` verified working | Two endpoints, both synth- and bundle-verified locally; a real `cdk deploy` and live request against each are the one thing that still needs confirming on a real AWS account — see `PROJECT_SUMMARY.md`'s Step 2.5–2.8 entries for exactly what's been confirmed where |

If this proof-of-concept is confirmed working, later steps migrate
`functions/src/payments`, `orders`, `delivery`, `email` here
incrementally, one at a time — `functions/` stays intact and available
until that migration is complete and confirmed, not deleted the moment
this step deploys successfully.
