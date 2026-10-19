import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = ['src/10_util.js', 'src/25_storage.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const SECRETS = {}; const ADMIN_EMAILS = [], MAX_BODY = 1;
const mod = new Function('crypto', 'TextEncoder', 'btoa', 'atob', 'cfg', src + '\nreturn { sigv4 };');
const { sigv4 } = mod(globalThis.crypto, TextEncoder, btoa, atob, () => ({}));
const r = await sigv4({ method: 'GET', path: '/test.txt', query: '', headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
  payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', amzDate: '20130524T000000Z', region: 'us-east-1', service: 's3', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' });
const want = 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41';
console.log(r.signature === want ? 'PASS SigV4 matches the AWS published test vector' : 'FAIL ' + r.signature);
process.exit(r.signature === want ? 0 : 1);
