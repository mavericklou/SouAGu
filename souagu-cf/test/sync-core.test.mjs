import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', '..', 'portfolio.html'), 'utf8');
const match = html.match(/\/\* SYNC_CORE_START \*\/([\s\S]*?)\/\* SYNC_CORE_END \*\//);
assert.ok(match, 'portfolio.html 中未找到 SYNC_CORE 标记');

const Core = new Function(match[1] + '\nreturn globalThis.SouAGuSyncCore;')();
assert.ok(Core, '同步核心未导出');

function rec(id, overrides = {}) {
  return {
    id,
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

test('同步码规范化：大小写/空格/无横线', () => {
  assert.equal(Core.normalizeCode('sg-7k3m-9qx2-p4tn-8abc'), 'SG-7K3M-9QX2-P4TN-8ABC');
  assert.equal(Core.normalizeCode('SG7K3M9QX2P4TN8ABC'), 'SG-7K3M-9QX2-P4TN-8ABC');
  assert.equal(Core.normalizeCode('  sg 7k3m 9qx2 p4tn 8abc '), 'SG-7K3M-9QX2-P4TN-8ABC');
});

test('同步码拒绝易混淆字符与错误长度', () => {
  assert.equal(Core.normalizeCode('SG-IIII-OOOO-1111-0000'), '');
  assert.equal(Core.normalizeCode('SG-1234'), '');
  assert.equal(Core.normalizeCode(''), '');
});

test('生成的同步码格式正确且随机', () => {
  const a = Core.generateCode();
  const b = Core.generateCode();
  assert.match(a, /^SG-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(Core.normalizeCode(a), a);
  assert.notEqual(a, b);
});

test('分享码规范化：必须带 SC 前缀', () => {
  assert.equal(Core.normalizeShareCode('sc-2abc-3def-4ghj-5klm'), 'SC-2ABC-3DEF-4GHJ-5KLM');
  assert.equal(Core.normalizeShareCode('SC2ABC3DEF4GHJ5KLM'), 'SC-2ABC-3DEF-4GHJ-5KLM');
  assert.equal(Core.normalizeShareCode('  sc 2abc 3def 4ghj 5klm '), 'SC-2ABC-3DEF-4GHJ-5KLM');
  assert.equal(Core.normalizeShareCode('SG-2ABC-3DEF-4GHJ-5KLM'), '');
  assert.equal(Core.normalizeShareCode('2ABC3DEF4GHJ5KLM'), '');
  assert.equal(Core.normalizeShareCode('SC-2ABC'), '');
});

test('生成的分享码格式正确且与主码前缀不同', () => {
  const code = Core.generateShareCode();
  assert.match(code, /^SC-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.equal(Core.normalizeShareCode(code), code);
  assert.equal(Core.normalizeCode(code), '');
});

test('UUID 生成与识别', () => {
  const id = Core.uuid();
  assert.equal(Core.isUuid(id), true);
  assert.equal(Core.isUuid('1700000000000-1-ab12cd'), false);
});

test('旧式 id 迁移为 UUID，并刷新 updatedAt', () => {
  const list = [rec('1700000000000-1-ab12cd', { updatedAt: '' })];
  const changed = Core.migrateIds(list);
  assert.equal(changed, true);
  assert.equal(Core.isUuid(list[0].id), true);
  assert.ok(list[0].updatedAt);
  assert.equal(list[0].deletedAt, null);
});

test('合并：双方独有记录都保留，同 id 取 updatedAt 较新者', () => {
  const local = [
    rec('a', { qty: 100, updatedAt: '2026-01-01T00:00:00.000Z' }),
    rec('b', { code: '000001', updatedAt: '2026-01-01T00:00:00.000Z' })
  ];
  const remote = [
    rec('a', { qty: 200, updatedAt: '2026-01-02T00:00:00.000Z' }),
    rec('c', { code: '300001', updatedAt: '2026-01-01T00:00:00.000Z' })
  ];
  const merged = Core.mergeHoldings(local, remote);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((r) => r.id === 'a').qty, 200);
  assert.ok(merged.find((r) => r.id === 'b'));
  assert.ok(merged.find((r) => r.id === 'c'));
});

test('合并：较新的墓碑优先，不会复活已删除记录', () => {
  const local = [rec('a', { deletedAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' })];
  const remote = [rec('a', { updatedAt: '2026-01-02T00:00:00.000Z' })];
  const merged = Core.mergeHoldings(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deletedAt, '2026-01-03T00:00:00.000Z');
});

test('合并：时间相同时墓碑优先于活跃记录', () => {
  const ts = '2026-01-03T00:00:00.000Z';
  const local = [rec('a', { deletedAt: ts, updatedAt: ts })];
  const remote = [rec('a', { updatedAt: ts })];
  const merged = Core.mergeHoldings(local, remote);
  assert.equal(merged[0].deletedAt, ts);
});

test('合并：时间相同时远端优先（服务端为准）', () => {
  const ts = '2026-01-03T00:00:00.000Z';
  const local = [rec('a', { qty: 100, updatedAt: ts })];
  const remote = [rec('a', { qty: 300, updatedAt: ts })];
  const merged = Core.mergeHoldings(local, remote);
  assert.equal(merged[0].qty, 300);
});

test('设置项按 settingsUpdatedAt 取较新者', () => {
  const merged = Core.mergeDocs(
    { holdings: [], settings: { stockRate: 1 }, settingsUpdatedAt: 100 },
    { holdings: [], settings: { stockRate: 2 }, settingsUpdatedAt: 200 }
  );
  assert.equal(merged.settings.stockRate, 2);
  assert.equal(merged.settingsUpdatedAt, 200);
});

test('docHash 不受记录顺序影响，内容变化会变', () => {
  const a = rec('a');
  const b = rec('b', { code: '000001' });
  const h1 = Core.docHash({ holdings: [a, b], settings: { stockRate: 1 }, settingsUpdatedAt: 1 });
  const h2 = Core.docHash({ holdings: [b, a], settings: { stockRate: 1 }, settingsUpdatedAt: 1 });
  const h3 = Core.docHash({ holdings: [b, { ...a, qty: 999 }], settings: { stockRate: 1 }, settingsUpdatedAt: 1 });
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test('docHash 忽略行情缓存字段', () => {
  const h1 = Core.docHash({ holdings: [rec('a')], settings: null });
  const h2 = Core.docHash({ holdings: [{ ...rec('a'), lastPrice: 12.3, lastChangePct: 1.2 }], settings: null });
  assert.equal(h1, h2);
});

test('重复记录统计：同代码+数量+成本但 id 不同', () => {
  const list = [
    rec('a'),
    rec('b'),
    rec('c', { qty: 200 }),
    rec('d', { deletedAt: '2026-01-02T00:00:00.000Z' })
  ];
  assert.equal(Core.countDuplicates(list), 1);
});

test('cleanRecord 丢弃非法代码并补齐字段', () => {
  assert.equal(Core.cleanRecord({ code: 'abc' }), null);
  const r = Core.cleanRecord({ code: '600000', qty: '100', cost: '10.5' });
  assert.equal(r.code, '600000');
  assert.equal(r.qty, 100);
  assert.equal(r.cost, 10.5);
  assert.ok(r.id);
  assert.ok(r.updatedAt);
});
