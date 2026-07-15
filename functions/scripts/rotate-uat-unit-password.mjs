import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = 'c3-chaclacayo';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const reportPath = join(scriptDirectory, '..', '.migration-reports', 'uat-credentials.json');
const temporaryPath = `${reportPath}.tmp`;

const credentials = JSON.parse(await readFile(reportPath, 'utf8'));
if (!credentials.unitEmail) {
  throw new Error('El reporte UAT no contiene unitEmail.');
}

const gcloudExecutable = process.platform === 'win32'
  ? (process.env.ComSpec || 'cmd.exe')
  : 'gcloud';
const gcloudArguments = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'gcloud auth print-access-token']
  : ['auth', 'print-access-token'];
const accessToken = execFileSync(gcloudExecutable, gcloudArguments, {
  encoding: 'utf8',
  windowsHide: true,
}).trim();

async function identityRequest(method, body) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:${method}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      },
      body: JSON.stringify(body),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Identity Toolkit ${method} falló (${response.status}): ${payload.error?.message || 'error desconocido'}`);
  }
  return payload;
}

const lookup = await identityRequest('lookup', { email: [credentials.unitEmail] });
const user = lookup.users?.[0];
if (!user?.localId) {
  throw new Error('No se encontró la cuenta sintética de la unidad.');
}

// base64url produce una clave ASCII alfanumérica de 24 caracteres sin espacios.
const unitPassword = randomBytes(18).toString('base64url');
await identityRequest('update', {
  localId: user.localId,
  password: unitPassword,
});

credentials.unitPassword = unitPassword;
await writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
await rename(temporaryPath, reportPath);

process.stdout.write(JSON.stringify({ success: true, passwordLength: unitPassword.length }));
