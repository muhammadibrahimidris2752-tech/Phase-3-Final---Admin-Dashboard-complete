#!/usr/bin/env node
/**
 * CDK app entry point — cdk.json's "app" setting runs this file via
 * ts-node. Run through `npm run synth` / `npm run deploy` (see
 * package.json or README.md for the full command reference), not
 * directly.
 */
import * as cdk from 'aws-cdk-lib';
import { AwsBackendStack } from '../lib/aws-backend-stack';

const app = new cdk.App();

new AwsBackendStack(app, 'KitchenHomeByNoorAwsBackendStack', {
  description:
    'Kitchen & Home By Noor — Phase 4 Step 2.5 AWS proof-of-concept (parallel to functions/, not a replacement for it).',
  env: {
    // Explicit region keeps every resource this stack creates in one
    // predictable place, regardless of the deploying machine's default
    // AWS CLI region. eu-west-1 (Ireland) is a reasoned starting point
    // — the closest AWS region to Firestore's europe-west1 (Belgium)
    // location among AWS's long-established, full-service EU regions
    // — not a precisely measured optimum. Worth comparing against
    // eu-central-1 (Frankfurt) with real latency numbers once this is
    // deployed; change here (not per-resource) if you do.
    region: 'eu-west-1',
  },
});
