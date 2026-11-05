/**
 * 持仓助手 — 分享码管理
 *
 *   GET    /api/share?code=SG-...     查询当前主档是否已生成分享码（不返回明文）
 *   POST   /api/share?code=SG-...     body { shareCode: "SC-..." } 生成 / 轮换分享码
 *   DELETE /api/share?code=SG-...     撤销当前分享码
 *
 * 同一个主档同时只有一个有效分享码：shareOwner 指针指向当前分享码，
 * 分享端 GET 会校验该指针，旧码即使映射残留也会被拒绝。
 */

import {
  parseCode,
  sha256Hex,
  ownerKey,
  shareKey,
  ownerShareKey
} from '../_lib/share.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

function ownerFromRequest(request) {
  const url = new URL(request.url);
  const parsed = parseCode(url.searchParams.get('code'));
  if (!parsed) return { error: '主同步码格式不正确' };
  if (parsed.kind !== 'owner') return { error: '请使用主同步码管理分享，分享码不能管理分享' };
  return { code: parsed.code };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const owner = ownerFromRequest(request);
  if (owner.error) return json({ error: owner.error }, 400);

  try {
    const ownerHash = await sha256Hex(owner.code);
    const doc = await env.HOLDINGS.get(ownerKey(ownerHash), 'json');
    if (!doc) return json({ error: '主同步码不存在或云端为空' }, 404);

    const ptr = await env.HOLDINGS.get(ownerShareKey(ownerHash), 'json');
    return json({
      configured: !!(ptr && ptr.share),
      createdAt: ptr ? (Number(ptr.createdAt) || 0) : 0
    });
  } catch (err) {
    return json({ error: '读取分享状态失败' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const owner = ownerFromRequest(request);
  if (owner.error) return json({ error: owner.error }, 400);

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ error: '请求体不是合法 JSON' }, 400);
  }

  const share = parseCode(body && body.shareCode);
  if (!share || share.kind !== 'share') {
    return json({ error: '分享码格式不正确，应为 SC-XXXX-XXXX-XXXX-XXXX' }, 400);
  }

  try {
    const ownerHash = await sha256Hex(owner.code);
    const doc = await env.HOLDINGS.get(ownerKey(ownerHash), 'json');
    if (!doc) return json({ error: '主同步码不存在或云端为空' }, 404);

    const shareHash = await sha256Hex(share.code);

    // 同一个分享码不能同时指向两个主档
    const existing = await env.HOLDINGS.get(shareKey(shareHash), 'json');
    if (existing && existing.owner && existing.owner !== ownerHash) {
      return json({ error: '分享码已被占用，请重试' }, 409);
    }

    const prev = await env.HOLDINGS.get(ownerShareKey(ownerHash), 'json');
    const now = Date.now();

    await env.HOLDINGS.put(shareKey(shareHash), JSON.stringify({ owner: ownerHash, createdAt: now }));
    await env.HOLDINGS.put(ownerShareKey(ownerHash), JSON.stringify({ share: shareHash, createdAt: now }));

    // 轮换后删除旧映射；即使删除失败，分享端也会因指针不匹配而拒绝旧码
    if (prev && prev.share && prev.share !== shareHash) {
      try { await env.HOLDINGS.delete(shareKey(prev.share)); } catch (err) { /* 忽略 */ }
    }

    return json({ shareCode: share.code, createdAt: now });
  } catch (err) {
    return json({ error: '生成分享码失败' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const owner = ownerFromRequest(request);
  if (owner.error) return json({ error: owner.error }, 400);

  try {
    const ownerHash = await sha256Hex(owner.code);
    const ptr = await env.HOLDINGS.get(ownerShareKey(ownerHash), 'json');

    if (!ptr || !ptr.share) return json({ revoked: false });

    try { await env.HOLDINGS.delete(shareKey(ptr.share)); } catch (err) { /* 忽略 */ }
    try { await env.HOLDINGS.delete(ownerShareKey(ownerHash)); } catch (err) { /* 忽略 */ }

    return json({ revoked: true });
  } catch (err) {
    return json({ error: '撤销分享码失败' }, 500);
  }
}
