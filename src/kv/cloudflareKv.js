const env = require('../config/env');

const BASE_URL = 'https://api.cloudflare.com/client/v4';

function kvUrl(key) {
  return `${BASE_URL}/accounts/${env.cloudflare.accountId}/storage/kv/namespaces/${env.cloudflare.namespaceId}/values/${encodeURIComponent(key)}`;
}

async function kvGet(key) {
  const res = await fetch(kvUrl(key), {
    headers: { Authorization: `Bearer ${env.cloudflare.apiToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Cloudflare KV GET ${key} a echoue: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function kvPut(key, value, { ttlSeconds } = {}) {
  const url = ttlSeconds ? `${kvUrl(key)}?expiration_ttl=${ttlSeconds}` : kvUrl(key);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.cloudflare.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Cloudflare KV PUT ${key} a echoue: ${res.status} ${await res.text()}`);
}

async function kvDelete(key) {
  const res = await fetch(kvUrl(key), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.cloudflare.apiToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Cloudflare KV DELETE ${key} a echoue: ${res.status} ${await res.text()}`);
  }
}

module.exports = { kvGet, kvPut, kvDelete };
