/**
 * 持仓助手 — Cloudflare Pages Function 云同步接口
 *
 *   GET  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX   读取主档
 *   GET  /api/sync?code=SC-XXXX-XXXX-XXXX-XXXX   读取分享码对应的只读快照
 *   PUT  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX   写入主档（分享码返回 403）
 *
 * 存储：Cloudflare KV
 *   主档   holdings:<SHA-256(主同步码)>
 *   分享   share:<SHA-256(分享码)> -> { owner: <主档 hash>, createdAt }
 *   指针   shareOwner:<主档 hash>  -> { share: <分享码 hash>, createdAt }
 *
 * 冲突：rev 乐观锁，不匹配返回 409 + 服务端全文
 * 分享码：只读；同一主档只有一个有效分享码（以 shareOwner 指针为准）
 *
 * 部署：见同目录 README.md
 */

const CODE_LENGTH = 16;
const OWNER_PREFIX = 'SG';
const SHARE_PREFIX = 'SC';
const OWNER_KEY_PREFIX = 'holdings:';
const SHARE_KEY_PREFIX = 'share:';
const OWNER_SHARE_KEY_PREFIX = 'shareOwner:';
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

/**
 * 接受带/不带横线、大小写混写。
 * SG 前缀或 16 位裸码 = 主同步码；SC 前缀 = 分享码。
 */
function parseCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let kind = 'owner';
  let explicit = false;

  if (s.length === 18 && (s.startsWith(OWNER_PREFIX) || s.startsWith(SHARE_PREFIX))) {
    kind = s.startsWith(SHARE_PREFIX) ? 'share' : 'owner';
    explicit = true;
    s = s.slice(2);
  }

  if (s.length !== CODE_LENGTH || !/^[A-HJ-NP-Z2-9]+$/.test(s)) return null;

  const prefix = kind === 'share' ? SHARE_PREFIX : OWNER_PREFIX;
  return {
    kind,
    explicit,
    raw: s,
    code: prefix + '-' + s.match(/.{4}/g).join('-')
  };
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function ownerKey(hash) { return OWNER_KEY_PREFIX + hash; }
function shareKey(hash) { return SHARE_KEY_PREFIX + hash; }
function ownerShareKey(hash) { return OWNER_SHARE_KEY_PREFIX + hash; }

function emptyDoc() {
  return { rev: 0, updatedAt: 0, holdings: [], settings: null, settingsUpdatedAt: 0, empty: true, readOnly: false };
}

function ownerPayload(doc) {
  return {
    rev: Number(doc.rev) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    holdings: Array.isArray(doc.holdings) ? doc.holdings : [],
    settings: doc.settings ?? null,
    settingsUpdatedAt: Number(doc.settingsUpdatedAt) || 0,
    empty: false,
    readOnly: false
  };
}

// 分享端不返回墓碑：只读方不需要删除历史，也避免已删除持仓的细节继续外泄
function sharePayload(doc, shareCode) {
  return {
    rev: Number(doc.rev) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    holdings: (Array.isArray(doc.holdings) ? doc.holdings : []).filter((r) => r && !r.deletedAt),
    settings: doc.settings ?? null,
    settingsUpdatedAt: Number(doc.settingsUpdatedAt) || 0,
    empty: false,
    readOnly: true,
    shareCode
  };
}

async function loadShared(env, shareCode) {
  const shareHash = await sha256Hex(shareCode);
  const map = await env.HOLDINGS.get(shareKey(shareHash), 'json');
  if (!map || typeof map.owner !== 'string') {
    return { ok: false, status: 404, error: '分享码无效或已被撤销' };
  }

  // 只有 shareOwner 指针当前指向的分享码才有效，保证“同时只有一个有效分享码”
  const ptr = await env.HOLDINGS.get(ownerShareKey(map.owner), 'json');
  if (!ptr || ptr.share !== shareHash) {
    return { ok: false, status: 404, error: '分享码已失效或已被撤销' };
  }

  const doc = await env.HOLDINGS.get(ownerKey(map.owner), 'json');
  if (!doc) return { ok: false, status: 404, error: '分享的持仓已失效' };

  return { ok: true, doc };
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
  const parsed = parseCode(url.searchParams.get('code'));
  if (!parsed) return json({ error: '同步码格式不正确' }, 400);

  try {
    if (parsed.kind === 'share') {
      const shared = await loadShared(env, parsed.code);
      if (!shared.ok) return json({ error: shared.error }, shared.status);
      return json(sharePayload(shared.doc, parsed.code));
    }

    const ownerHash = await sha256Hex(parsed.code);
    const doc = await env.HOLDINGS.get(ownerKey(ownerHash), 'json');
    if (doc) return json(ownerPayload(doc));

    // 兼容：用户只粘了 16 位分享码、漏掉 SC 前缀时，按分享码再查一次
    if (!parsed.explicit) {
      const shareCode = SHARE_PREFIX + '-' + parsed.raw.match(/.{4}/g).join('-');
      const shared = await loadShared(env, shareCode);
      if (shared.ok) return json(sharePayload(shared.doc, shareCode));
    }

    return json(emptyDoc());
  } catch (err) {
    return json({ error: '读取云端数据失败' }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const url = new URL(request.url);
  const parsed = parseCode(url.searchParams.get('code'));
  if (!parsed) return json({ error: '同步码格式不正确' }, 400);

  // 分享码只读：在方法层直接拒绝，客户端 UI 只是辅助
  if (parsed.kind === 'share') {
    return json({ error: '分享码只有只读权限，不能上传修改' }, 403);
  }

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

  const ownerHash = await sha256Hex(parsed.code);
  const key = ownerKey(ownerHash);

  try {
    // 防止把 16 位分享码当成主码写入，生成一份无意义的空档
    if (!parsed.explicit) {
      const shareHash = await sha256Hex(SHARE_PREFIX + '-' + parsed.raw.match(/.{4}/g).join('-'));
      const shareMap = await env.HOLDINGS.get(shareKey(shareHash), 'json');
      if (shareMap) return json({ error: '这是分享码，只能只读，不能上传' }, 403);
    }

    const current = await env.HOLDINGS.get(key, 'json');
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

    await env.HOLDINGS.put(key, JSON.stringify(doc), { expirationTtl: TTL_SECONDS });

    return json({ rev: doc.rev, updatedAt: doc.updatedAt, count: doc.holdings.length });
  } catch (err) {
    return json({ error: '写入云端失败' }, 500);
  }
}
