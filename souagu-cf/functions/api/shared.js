/**
 * 持仓助手 — 只读分享读取接口
 *
 *   GET /api/shared?code=SC-XXXX-XXXX-XXXX-XXXX
 *     → 200 { rev, updatedAt, holdings, settings, settingsUpdatedAt, readOnly: true, shareCode }
 *     → 400 不是分享码
 *     → 404 分享码无效 / 已撤销 / 已轮换
 *
 * 只读分享页通过这个接口读取主档快照；/api/sync 不再返回分享内容。
 */

import { parseCode, loadShared, sharePayload } from '../_lib/share.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.HOLDINGS) return json({ error: '服务端未绑定 KV（变量名应为 HOLDINGS）' }, 500);

  const url = new URL(request.url);
  const parsed = parseCode(url.searchParams.get('code'));
  // 只读接口只接受明确的 SC 前缀；裸 16 位码仍按主同步码处理，避免歧义
  if (!parsed || parsed.kind !== 'share' || !parsed.explicit) {
    return json({ error: '分享码格式不正确，应为 SC-XXXX-XXXX-XXXX-XXXX' }, 400);
  }

  try {
    const shared = await loadShared(env, parsed.code);
    if (!shared.ok) return json({ error: shared.error }, shared.status);
    return json(sharePayload(shared.doc, parsed.code));
  } catch (err) {
    return json({ error: '读取分享数据失败' }, 500);
  }
}
