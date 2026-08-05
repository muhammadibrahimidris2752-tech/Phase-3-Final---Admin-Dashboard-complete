/**
 * CDK stack for the Phase 4 Steps 2.5–2.8 AWS proof-of-concept: two
 * Lambda functions, fronted by one HTTP API Gateway, each with a
 * least-privilege IAM role scoped to exactly the one Secrets Manager
 * secret it needs.
 *
 * This stack provisions everything needed to recreate the backend
 * EXCEPT the Secrets Manager secret's VALUE — creating the secret
 * itself (as an empty placeholder) would be safe to automate, but
 * populating it with the real Firebase service account key is left as
 * a deliberate manual step (see README.md) so that key is never
 * captured in CloudFormation state, `cdk diff` output, or version
 * control.
 *
 * IAM note: there's no explicit `new iam.Role(...)` here. NodejsFunction
 * auto-generates a least-privilege execution role per function (basic
 * CloudWatch Logs permissions, scoped to that function's own log
 * group) as part of synthesizing the stack — those auto-generated
 * roles ARE the IAM roles this stack provisions, one per function.
 * `grantRead()` below adds exactly one more permission to each (read
 * this one secret) rather than hand-writing an IAM policy document,
 * which is the current recommended CDK pattern for least-privilege
 * grants.
 */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { FIREBASE_SERVICE_ACCOUNT_SECRET_NAME } from '../lambda/config';
import { authLambdaCommandHooks } from './auth-lambda-bundling';

const FUNCTION_NAME = 'kitchen-home-by-noor-health';
const AUTH_CHECK_FUNCTION_NAME = 'kitchen-home-by-noor-auth-check';

export class AwsBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // References the secret BY NAME — does not create it or set its
    // value. The secret is created once, manually, with the real
    // Firebase service account key pasted in (see README.md); that's
    // the one manual AWS step this proof-of-concept still requires.
    // If the secret doesn't exist yet when this stack deploys, this
    // reference resolves fine (CDK doesn't validate existence at synth
    // time) but the Lambda will fail at runtime until it does.
    const firebaseServiceAccountSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'FirebaseServiceAccountSecret',
      FIREBASE_SERVICE_ACCOUNT_SECRET_NAME
    );

    // Created explicitly (rather than relying on Lambda's implicit
    // auto-created default) so retention and removal policy are
    // controlled rather than left at CloudWatch's "never expire"
    // default. The name MUST be exactly /aws/lambda/{functionName} —
    // that's the fixed convention Lambda's runtime always logs to,
    // regardless of what any CloudFormation resource is named.
    const logGroup = new logs.LogGroup(this, 'HealthFunctionLogGroup', {
      logGroupName: `/aws/lambda/${FUNCTION_NAME}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const healthFunction = new lambdaNodejs.NodejsFunction(this, 'HealthFunction', {
      functionName: FUNCTION_NAME,
      description: 'Phase 4 Step 2.5 proof-of-concept — reads one Firestore deliveryZones document.',
      entry: path.join(__dirname, '..', 'lambda', 'health', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup,
      bundling: {
        // firebase-admin pulls in @google-cloud/firestore, which pulls
        // in @grpc/grpc-js — a package with a documented history of
        // issues being tree-shaken/inlined by esbuild (dynamic
        // requires, proto file loading). Listing it here tells CDK to
        // npm-install firebase-admin as real node_modules inside the
        // bundle instead of inlining it via esbuild — the documented
        // fix for this exact class of problem.
        nodeModules: ['firebase-admin'],
        // esbuild is declared as a devDependency in package.json
        // specifically so NodejsFunction finds it locally and bundles
        // with it directly — without a locally resolvable esbuild,
        // CDK silently falls back to bundling inside a Docker
        // container instead (see aws-cdk-lib's aws-lambda-nodejs
        // docs), which fails outright on any machine without Docker
        // installed. forceDockerBundling: false makes that "local
        // esbuild first, Docker never required" intent explicit rather
        // than relying on it being the (correct, but implicit) default.
        forceDockerBundling: false,
        minify: true,
        sourceMap: true,
        target: 'node22',
      },
      // No secrets or credentials here — only non-sensitive settings.
      // The Firebase service account itself is fetched at runtime from
      // Secrets Manager (see lambda/admin.ts), never passed through an
      // environment variable.
    });

    // Least-privilege: this function can read exactly one secret in
    // this AWS account, and nothing else beyond what NodejsFunction's
    // default execution role already grants for CloudWatch Logs.
    firebaseServiceAccountSecret.grantRead(healthFunction);

    // Same explicit-LogGroup reasoning as HealthFunctionLogGroup above:
    // controlled retention/removal policy rather than CloudWatch's
    // implicit "never expire" default.
    const authCheckLogGroup = new logs.LogGroup(this, 'AuthCheckFunctionLogGroup', {
      logGroupName: `/aws/lambda/${AUTH_CHECK_FUNCTION_NAME}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Step 2.8. Same bundling options as HealthFunction, plus
    // commandHooks: authLambdaCommandHooks — required here and not
    // above because this is the first function whose entry
    // (lambda/health/auth-check-handler.ts) imports lambda/auth, which
    // imports firebase-admin/auth, which is what actually needs the
    // jose/jwks-rsa fix. See lib/auth-lambda-bundling.ts for the full
    // mechanism and why it has to be applied this specific way.
    const authCheckFunction = new lambdaNodejs.NodejsFunction(this, 'AuthCheckFunction', {
      functionName: AUTH_CHECK_FUNCTION_NAME,
      description: 'Phase 4 Step 2.8 — proves the Step 2.7 auth bundling fix on a real, deployed Lambda.',
      entry: path.join(__dirname, '..', 'lambda', 'health', 'auth-check-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      logGroup: authCheckLogGroup,
      bundling: {
        nodeModules: ['firebase-admin'],
        forceDockerBundling: false,
        minify: true,
        sourceMap: true,
        target: 'node22',
        commandHooks: authLambdaCommandHooks,
      },
      // Same as HealthFunction: no secrets/credentials as environment
      // variables. The Firebase service account is fetched at runtime
      // from Secrets Manager (see lambda/admin.ts).
    });

    // Same least-privilege grant as HealthFunction, on this function's
    // own auto-generated role — reading the secret is the only AWS
    // permission either function needs beyond CloudWatch Logs.
    firebaseServiceAccountSecret.grantRead(authCheckFunction);

    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: 'kitchen-home-by-noor-aws-backend',
      description: 'Phase 4 Step 2.5–2.8 proof-of-concept API.',
    });

    httpApi.addRoutes({
      path: '/health/{zoneId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('HealthIntegration', healthFunction),
    });

    httpApi.addRoutes({
      path: '/health/auth-check',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration('AuthCheckIntegration', authCheckFunction),
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description:
        'Base URL of the HTTP API — call {ApiUrl}/health/{zoneId} for the Firestore check, ' +
        'or GET {ApiUrl}/health/auth-check with an "Authorization: Bearer <Firebase ID token>" ' +
        'header (from a signed-in owner account) for the auth check.',
    });
  }
}
