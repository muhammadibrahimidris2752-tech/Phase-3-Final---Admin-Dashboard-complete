# aws-backend — Phase 4 Steps 2.5–2.7 (AWS proof-of-concept)

This is a **parallel, standalone backend**, built to validate whether
AWS Lambda + API Gateway can replace `functions/` (the Firebase Cloud
Functions backend from Phase 4 Steps 1–2). It does not touch, depend
on, or replace anything in `functions/`, the frontend, or Firebase
Hosting — both backends currently exist side by side, and `functions/`
remains the one actually wired to anything.

**Scope of this step, deliberately minimal:** one endpoint,
`GET /health/{zoneId}`, which reads one document from Firestore's
existing `deliveryZones` collection and returns it as JSON. Nothing
about checkout, Paystack, orders, or emails is implemented here yet —
see `lambda/payments/`, `lambda/orders/`, `lambda/email/` for
placeholders describing what would move here in later steps, *if* this
proof-of-concept is confirmed working and a decision is made to
proceed.

## Architecture

```
API Gateway (HTTP API)  --->  Lambda (Node.js 22, TypeScript)  --->  Firestore
      GET /health/{zoneId}         reads Firebase service account         (via Firebase
                                    from AWS Secrets Manager,               Admin SDK)
                                    initializes Firebase Admin SDK
                                    once per warm execution
```

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

## Local testing without deploying

CDK doesn't include a built-in local Lambda invoker the way the
Firebase emulator does for `functions/`. Two practical options:

- **`cdk synth`** — confirms the stack synthesizes correctly (catches
  most CDK-level mistakes) without touching AWS at all.
- **Deploy once, then iterate against the real thing** — for a
  single-endpoint proof-of-concept, this is usually faster than
  standing up a local Lambda Runtime Interface Emulator. If you'd
  rather test locally before every deploy as this grows, look at
  [AWS SAM Local](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/using-sam-cli-local.html)
  or the Lambda Runtime Interface Emulator directly — neither is set
  up in this proof-of-concept, since it's genuinely one endpoint.

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
same as a confirmed real deploy — see the verification limits in
`PROJECT_SUMMARY.md`'s Step 2.7 section.

## Project structure

```
aws-backend/
  bin/aws-backend.ts        CDK app entry point
  lib/aws-backend-stack.ts   CDK stack: Lambda, HTTP API, IAM (via grantRead),
                             Secrets Manager reference, CloudWatch Log Group
  lib/auth-lambda-bundling.ts Step 2.7 — commandHooks fix for the jose/
                             jwks-rsa crash. Not used by HealthFunction;
                             for any future NodejsFunction importing
                             lambda/auth. Full rationale in its header.
  scripts/verify-auth-bundle.sh  Step 2.7 — bundles a given entry point
                             through a real, throwaway cdk synth and
                             checks it loads without the ERR_REQUIRE_ESM
                             crash. Run before wiring a real auth-gated
                             endpoint's bundling config by hand.
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
                               functions/src/utils/auth.ts exactly. Ready
                               for future endpoints; not used by /health
    delivery/                   getDeliveryZoneById() — the Firestore read
                               /health is built on, kept reusable for real
                               delivery-fee-calculation logic later
    payments/, orders/, email/   Empty placeholders — where the
                               corresponding functions/src/ modules would
                               migrate to, if this proof-of-concept is
                               confirmed and that decision is made
    health/handler.ts            The one real Lambda handler this step ships
```

## Relationship to `functions/`

Nothing here modifies, depends on, or was generated from `functions/`.
The two are intentionally parallel:

| | `functions/` (Phase 4 Steps 1\u20132) | `aws-backend/` (this step) |
|---|---|---|
| Compute | Firebase Cloud Functions v2 | AWS Lambda |
| Entry point | `onCall`/`onRequest`, auth context automatic | API Gateway event, auth verified explicitly |
| Firebase Admin SDK credentials | Automatic (Application Default Credentials) | Explicit service account key, from Secrets Manager |
| Secrets | Firebase Secret Manager (`defineSecret`) | AWS Secrets Manager |
| Status | Deployed, `healthCheck` verified working | Proof-of-concept, not yet deployed |

If this proof-of-concept is confirmed working, later steps migrate
`functions/src/payments`, `orders`, `delivery`, `email` here
incrementally, one at a time — `functions/` stays intact and available
until that migration is complete and confirmed, not deleted the moment
this step deploys successfully.
