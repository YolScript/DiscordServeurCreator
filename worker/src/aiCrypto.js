// Chiffrement au repos des cles API IA fournies par les proprietaires de
// serveur. AES-GCM avec une cle derivee (SHA-256) d'un secret Worker
// (AI_KEY_ENCRYPTION_SECRET) jamais expose au frontend. Le Worker peut
// toujours dechiffrer (necessaire pour appeler l'API IA au nom du serveur),
// mais une fuite du KV seul ne suffit pas a recuperer les cles en clair.

function bufToB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function getKey(env) {
  const secret = env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error('AI_KEY_ENCRYPTION_SECRET manquant cote Worker.');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env, plaintext) {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return `${bufToB64(iv)}:${bufToB64(ciphertext)}`;
}

export async function decryptSecret(env, encoded) {
  const [ivB64, dataB64] = encoded.split(':');
  const key = await getKey(env);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(ivB64) }, key, b64ToBuf(dataB64));
  return new TextDecoder().decode(plainBuf);
}
