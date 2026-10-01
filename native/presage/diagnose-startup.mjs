// Startup only: no camera, frames, readings, or real credential required.
import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import sdkModule from '@smartspectra/node-sdk';

const apiKey = process.env.PRESAGE_API_KEY || 'placeholder-not-a-real-key';
const scrub = value => String(value ?? '').split(apiKey).join('[redacted]')
  .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/https?:\/\/\S+/g, '[url redacted]').slice(0, 3000);
const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'SmartSpectraSDK');
await mkdir(cache, { recursive: true, mode: 0o700 });
await access(cache, constants.W_OK);
console.log(JSON.stringify({ diagnostic: 'startup', platform: process.platform, arch: process.arch,
  node: process.version, sdk: sdkModule.SmartSpectraSDK.version, cacheWritable: true, metrics: [2, 13, 15] }));
const sdk = new sdkModule.SmartSpectraSDK({ apiKey, requestedMetrics: [2, 13, 15],
  enableTelemetry: false, enableAccumulatedOutput: false,
  // Native logs are enabled only for this isolated dummy-key diagnostic.
  logLevel: apiKey === 'placeholder-not-a-real-key' ? sdkModule.SmartSpectraLogLevel.kInfo : sdkModule.SmartSpectraLogLevel.kNone });
sdk.on('error', (code, message, retryable) => console.log(JSON.stringify({ event: 'sdk-error', code, message: scrub(message), retryable })));
sdk.on('metrics', () => {});
try {
  sdk.useCustomInput(sdkModule.FrameTransform.kNone);
  sdk.start();
  console.log(JSON.stringify({ startup: 'returned', status: sdk.processingStatus }));
} catch (error) {
  console.log(JSON.stringify({ startup: 'failed', code: error.code, message: scrub(error.message), retryable: error.retryable }));
} finally {
  await sdk.destroy();
}
