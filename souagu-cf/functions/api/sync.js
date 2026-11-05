/**
 * 持仓助手 — Cloudflare Pages Function 云同步接口
 *
 *   GET  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
 *   PUT  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
 *        body: { rev, holdings, settings, settingsUpdatedAt }
 *
 * 存储：Cloudflare KV，key = "holdings:" + SHA-256(规范化同步码)
 * 冲突：rev 乐观锁，不匹配返回 409 + 服务端全文
 *
 * 部署：见同目录 README.md
 */

const CODE_LENGTH = 16;
const KEY_PREFIX = 'holdings:';
const MAX_BYTES = 256 * 1024;
const MAX_HOLDINGS = 5000;
const TTL_SECONDS = 365 * 24 * 60 * 60;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      ...CORS_HEADERS
    }
  });
}

/** 接受带/不带横线、大小写混写；统一成 SG-XXXX-XXXX-XXXX-XXXX */
function canonicalCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length === 18 && s.startsWith('SG')) s = s.slice(2);
  if (s.length !== CODE_LENGTH || !/^[A-HJ-NP-Z2-9]+$/.test(s)) return null;
  return 'SG-' + s.match(/.{4}/g).join('-');
}

async function kvKey(code) {
  const data = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return KEY_PREFIX + hex;
}

function emptyDoc() {
  return { rev: 0, updatedAt: 0, holdings: [], settings: null, settingsUpdatedAt: 0, empty: true };
}

function sanitizeRecord(r) {
  return {
    id: String(r.id),
    code: String(r.code),
    name: r.name == null ? String(r.code) : String(r.name),
    qty: Number(r.qty),
    cost: Number(r.cost),
    createdAt: r.createdAt == null ? null : String(r.createdAt),
    updatedAt: r.updatedAt == null ? null : String(r.updatedAt),
    deletedAt: r.deletedAt == null ? null : String(r.deletedAt)
  };
}

function validateDoc(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '请求体必须是 JSON 对象';
  if (!Array.isArray(body.holdings)) return 'holdings 必须是数组';
  if (body.holdings.length > MAX_HOLDINGS) return '持仓条数过多（上限 ' + MAX_HOLDINGS + '）';

  for (const r of body.holdings) {
    if (!r || typeof r !== 'object') return '持仓记录格式错误';
    if (typeof r.id !== 'string' || !r.id || r.id.length > 64) return '持仓 id 无效';
    if (typeof r.code !== 'string' || !/^\d{6}$/.test(r.code)) return '股票代码必须是 6 位数字';
    if (typeof r.qty !== 'number' || !Number.isFinite(r.qty)) return '持仓数量无效';
    if (typeof r.cost !== 'number' || !Number.isFinite(r.cost)) return '成本价无效';
    if (r.name != null && (typeof r.name !== 'string' || r.name.length > 64)) return '股票名称无效';
  }

  if (body.settings != null && (typeof body.settings !== 'object' || Array.isArray(body.settings))) {
    return 'settings 无效';
  }
  if (body.settingsUpdatedAt != null && !Number.isFinite(Number(body.settingsUpdatedAt))) {
    return 'settingsUpdatedAt 无效';
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const url = new URL(request.url);
  const code = canonicalCode(url.searchParams.get('code'));
  if (!code) return json({ error: '同步码格式不正确' }, 400);

  const key = await kvKey(code);
  let doc = null;
  try {
    doc = await env.HOLDINGS.get(key, 'json');
  } catch (err) {
    return json({ error: '读取云端数据失败' }, 500);
  }

  if (!doc) return json(emptyDoc());
  return json({
    rev: Number(doc.rev) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    holdings: Array.isArray(doc.holdings) ? doc.holdings : [],
    settings: doc.settings ?? null,
    settingsUpdatedAt: Number(doc.settingsUpdatedAt) || 0,
    empty: false
  });
}

export async function onRequestPut({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const url = new URL(request.url);
  const code = canonicalCode(url.searchParams.get('code'));
  if (!code) return json({ error: '同步码格式不正确' }, 400);

  let raw;
  try {
    raw = await request.text();
  } catch (err) {
    return json({ error: '读取请求体失败' }, 400);
  }

  const bytes = new TextEncoder().encode(raw).length;
  if (bytes > MAX_BYTES) return json({ error: '数据超过 256 KB 限制' }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch (err) {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const invalid = validateDoc(body);
  if (invalid) return json({ error: invalid }, 400);

  const key = await kvKey(code);
  let current = null;
  try {
    current = await env.HOLDINGS.get(key, 'json');
  } catch (err) {
    return json({ error: '读取云端数据失败' }, 500);
  }

  const currentRev = current && Number.isFinite(Number(current.rev)) ? Number(current.rev) : 0;
  const clientRev = Number.isFinite(Number(body.rev)) ? Number(body.rev) : 0;

  if (clientRev !== currentRev) {
    return json({
      error: '版本冲突，请先合并云端数据',
      rev: currentRev,
      updatedAt: current ? (Number(current.updatedAt) || 0) : 0,
      holdings: current && Array.isArray(current.holdings) ? current.holdings : [],
      settings: current ? (current.settings ?? null) : null,
      settingsUpdatedAt: current ? (Number(current.settingsUpdatedAt) || 0) : 0
    }, 409);
  }

  const doc = {
    rev: currentRev + 1,
    updatedAt: Date.now(),
    holdings: body.holdings.map(sanitizeRecord),
    settings: body.settings == null ? null : body.settings,
    settingsUpdatedAt: Number(body.settingsUpdatedAt) || 0
  };

  try {
    await env.HOLDINGS.put(key, JSON.stringify(doc), { expirationTtl: TTL_SECONDS });
  } catch (err) {
    return json({ error: '写入云端失败' }, 500);
  }

  return json({ rev: doc.rev, updatedAt: doc.updatedAt, count: doc.holdings.length });
}
