import { config } from './config.js';

// OAuth tokens and API keys of connected services are stored encrypted with
// AES-GCM. The key lives only in the control Sprite's environment.
const keyPromise = crypto.subtle.importKey(
  'raw',
  Buffer.from(config.encryptionKey, 'base64'),
  'AES-GCM',
  false,
  ['encrypt', 'decrypt'],
);

export async function encrypt(value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await keyPromise,
    data,
  );
  return `${Buffer.from(iv).toString('base64')}.${Buffer.from(sealed).toString('base64')}`;
}

export async function decrypt(text) {
  if (!text) return {};
  const [iv, sealed] = text.split('.');
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    await keyPromise,
    Buffer.from(sealed, 'base64'),
  );
  return JSON.parse(new TextDecoder().decode(data));
}
