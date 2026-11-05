import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as getSync, onRequestPut as putSync } from '../functions/api/sync.js';
import { onRequestGet as getShared } from '../functions/api/shared.js';
import {
  onRequestGet as getShareState,
  onRequestPost as createShare,
  onRequestDelete as revokeShare
} from '../functions/api/share.js';

const OWNER = 'SG-7K3M-9QX2-P4TN-8ABC';
const OWNER2 = 'SG-4DEF-5GHJ-6KLM-7NPQ';
const SHARE_A = 'SC-2ABC-3DEF-4GHJ-5KLM';
const SHARE_B = 'SC-9NPQ-8RST-7UVW-6XYZ';
const BASE = 'https://souagu.pages.dev/api/sync';
const SHARED_BASE = 'https://souagu.pages.dev/api/shared';
const SHARE_BASE = 'https://souagu.pages.dev/api/share';

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

function request(url, method = 'GET', body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  return new Request(url, opts);
}

function readSync(env, code) {
  return getSync({ request: request(`${BASE}?code=${encodeURIComponent(code)}`), env });
}

function writeSync(env, code, body) {
  return putSync({ request: request(`${BASE}?code=${encodeURIComponent(code)}`, 'PUT', body), env });
}

function readShared(env, code) {
  return getShared({ request: request(`${SHARED_BASE}?code=${encodeURIComponent(code)}`), env });
}

function readShareState(env, code) {
  return getShareState({ request: request(`${SHARE_BASE}?code=${encodeURIComponent(code)}`), env });
}

function create(env, ownerCode, shareCode) {
  return createShare({ request: request(`${SHARE_BASE}?code=${encodeURIComponent(ownerCode)}`, 'POST', { shareCode }), env });
}

function revoke(env, ownerCode) {
  return revokeShare({ request: request(`${SHARE_BASE}?code=${encodeURIComponent(ownerCode)}`, 'DELETE'), env });
}

async function seed(env, code = OWNER, holdings = [record()]) {
  const res = await writeSync(env, code, { rev: 0, holdings, settings: { stockRate: 1 }, settingsUpdatedAt: 123 });
  assert.equal(res.status, 200);
}

test('主档正常读写，响应带 readOnly:false', async () => {
  const env = makeEnv();
  await seed(env);
  const body = await (await readSync(env, OWNER)).json();
  assert.equal(body.rev, 1);
  assert.equal(body.readOnly, false);
  assert.equal(body.holdings.length, 1);
});

test('生成分享码后：只读接口返回数据、过滤墓碑、分享码不能 PUT', async () => {
  const env = makeEnv();
  await seed(env, OWNER, [
    record(),
    record({ id: '22222222-2222-4222-8222-222222222222', code: '000001', deletedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' })
  ]);

  const created = await (await create(env, OWNER, SHARE_A)).json();
  assert.equal(created.shareCode, SHARE_A);

  // /api/sync 不再读取分享码
  const wrongApi = await readSync(env, SHARE_A);
  assert.equal(wrongApi.status, 400);

  const res = await readShared(env, SHARE_A);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.readOnly, true);
  assert.equal(body.shareCode, SHARE_A);
  assert.equal(body.holdings.length, 1);
  assert.equal(body.holdings[0].code, '600000');
  assert.deepEqual(body.settings, { stockRate: 1 });

  const denied = await writeSync(env, SHARE_A, { rev: body.rev, holdings: [], settings: null, settingsUpdatedAt: 0 });
  assert.equal(denied.status, 403);

  // 漏写 SC 前缀的裸 16 位分享码同样不能上传
  const rawShare = SHARE_A.replace(/^SC-/, '').replace(/-/g, '');
  const deniedRaw = await writeSync(env, rawShare, { rev: 0, holdings: [], settings: null, settingsUpdatedAt: 0 });
  assert.equal(deniedRaw.status, 403);
});

test('分享码可省略横线 / 小写；只读接口拒绝主码和裸码', async () => {
  const env = makeEnv();
  await seed(env);
  await create(env, OWNER, SHARE_B);

  const a = await (await readShared(env, 'sc9npq8rst7uvw6xyz')).json();
  assert.equal(a.readOnly, true);
  assert.equal(a.shareCode, SHARE_B);

  const raw = SHARE_B.replace(/^SC-/, '').replace(/-/g, '');
  assert.equal((await readShared(env, raw)).status, 400);
  assert.equal((await readShared(env, OWNER)).status, 400);
});

test('轮换后旧分享码立即失效，只有一个有效码', async () => {
  const env = makeEnv();
  await seed(env);
  await create(env, OWNER, SHARE_A);
  await create(env, OWNER, SHARE_B);

  assert.equal((await readShared(env, SHARE_A)).status, 404);
  assert.equal((await readShared(env, SHARE_B)).status, 200);
});

test('撤销分享码后失效，状态为未配置', async () => {
  const env = makeEnv();
  await seed(env);
  await create(env, OWNER, SHARE_A);

  const before = await (await readShareState(env, OWNER)).json();
  assert.equal(before.configured, true);

  const res = await (await revoke(env, OWNER)).json();
  assert.equal(res.revoked, true);

  assert.equal((await readShared(env, SHARE_A)).status, 404);
  const after = await (await readShareState(env, OWNER)).json();
  assert.equal(after.configured, false);

  const again = await (await revoke(env, OWNER)).json();
  assert.equal(again.revoked, false);
});

test('分享码不能管理分享，主码不能当分享码注册', async () => {
  const env = makeEnv();
  await seed(env);
  await create(env, OWNER, SHARE_A);

  const res = await create(env, SHARE_A, SHARE_B);
  assert.equal(res.status, 400);

  const bad = await create(env, OWNER, OWNER);
  assert.equal(bad.status, 400);
});

test('同一个分享码不能绑定到两个主档', async () => {
  const env = makeEnv();
  await seed(env, OWNER);
  await seed(env, OWNER2);
  await create(env, OWNER, SHARE_A);

  const res = await create(env, OWNER2, SHARE_A);
  assert.equal(res.status, 409);
});

test('撤销分享不影响主档读写', async () => {
  const env = makeEnv();
  await seed(env);
  await create(env, OWNER, SHARE_A);
  await revoke(env, OWNER);

  const body = await (await readSync(env, OWNER)).json();
  assert.equal(body.rev, 1);
  assert.equal(body.holdings.length, 1);

  const ok = await writeSync(env, OWNER, { rev: 1, holdings: [record({ qty: 200 })], settings: null, settingsUpdatedAt: 0 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rev, 2);
});
