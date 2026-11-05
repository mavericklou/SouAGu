import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, onRequestPut, onRequestOptions } from '../functions/api/sync.js';

const CODE = 'SG-7K3M-9QX2-P4TN-8ABC';
const BASE = 'https://souagu.pages.dev/api/sync';

function makeEnv() {
  const store = new Map();
  return {
    store,
    HOLDINGS: {
      async get(key, type) {
        if (!store.has(key)) return null;
        const value = store.get(key);
        return type === 'json' ? JSON.parse(value) : value;
      },
      async put(key, value) {
        store.set(key, value);
      },
      async delete(key) {
        store.delete(key);
      }
    }
  };
}

function record(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: '600000',
    name: '浦发银行',
    qty: 100,
    cost: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides
  };
}

function get(env, code = CODE) {
  return onRequestGet({ request: new Request(`${BASE}?code=${encodeURIComponent(code)}`), env });
}

function put(env, body, code = CODE) {
  return onRequestPut({
    request: new Request(`${BASE}?code=${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    env
  });
}

test('OPTIONS 返回 CORS 头', async () => {
  const res = await onRequestOptions();
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('空档 GET 返回 rev 0 与空数组', async () => {
  const res = await get(makeEnv());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rev, 0);
  assert.deepEqual(body.holdings, []);
  assert.equal(body.empty, true);
});

test('PUT → GET 往返，rev 递增', async () => {
  const env = makeEnv();
  const res = await put(env, {
    rev: 0,
    holdings: [record()],
    settings: { stockRate: 1 },
    settingsUpdatedAt: 123
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.rev, 1);

  const got = await (await get(env)).json();
  assert.equal(got.rev, 1);
  assert.equal(got.holdings.length, 1);
  assert.equal(got.holdings[0].code, '600000');
  assert.deepEqual(got.settings, { stockRate: 1 });
  assert.equal(got.settingsUpdatedAt, 123);
});

test('rev 不匹配返回 409 并附带服务端全文', async () => {
  const env = makeEnv();
  await put(env, { rev: 0, holdings: [record()], settings: null, settingsUpdatedAt: 0 });

  const res = await put(env, {
    rev: 0,
    holdings: [record({ qty: 999 })],
    settings: null,
    settingsUpdatedAt: 0
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.rev, 1);
  assert.equal(body.holdings.length, 1);
  assert.equal(body.holdings[0].qty, 100);
});

test('同步码可省略横线 / 小写', async () => {
  const env = makeEnv();
  await put(env, { rev: 0, holdings: [record()], settings: null, settingsUpdatedAt: 0 }, 'sg7k3m9qx2p4tn8abc');
  const got = await (await get(env, 'SG-7K3M-9QX2-P4TN-8ABC')).json();
  assert.equal(got.holdings.length, 1);
});

test('非法同步码返回 400', async () => {
  const res = await get(makeEnv(), 'SG-1234');
  assert.equal(res.status, 400);
});

test('非法持仓字段返回 400', async () => {
  const env = makeEnv();
  const res = await put(env, {
    rev: 0,
    holdings: [record({ code: 'abc' })],
    settings: null,
    settingsUpdatedAt: 0
  });
  assert.equal(res.status, 400);
});

test('超过 256 KB 返回 413', async () => {
  const env = makeEnv();
  const res = await put(env, {
    rev: 0,
    holdings: [record()],
    settings: null,
    settingsUpdatedAt: 0,
    junk: 'x'.repeat(300 * 1024)
  });
  assert.equal(res.status, 413);
});

test('未绑定 KV 返回 500', async () => {
  const res = await get({});
  assert.equal(res.status, 500);
});

test('KV key 为哈希，不包含明文同步码', async () => {
  const env = makeEnv();
  await put(env, { rev: 0, holdings: [record()], settings: null, settingsUpdatedAt: 0 });

  const key = [...env.store.keys()][0];
  assert.ok(key.startsWith('holdings:'));
  assert.equal(key.includes('7K3M'), false);
  assert.match(key, /^holdings:[0-9a-f]{64}$/);
});
