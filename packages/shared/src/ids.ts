/**
 * Random id generator. Uses crypto.getRandomValues rather than
 * crypto.randomUUID because the latter is only available in secure contexts,
 * and this app is usually reached over plain http on a LAN.
 */
export function newId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(36).padStart(2, '0').slice(-2);
  return prefix + out;
}
