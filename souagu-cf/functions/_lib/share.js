/**
 * 分享码公共逻辑（sync.js / share.js / shared.js 共用）
 *
 * 主码   holdings:<SHA-256(主同步码)>
 * 分享   share:<SHA-256(分享码)> -> { owner: <主档 hash>, createdAt, name }
 * 指针   shareOwner:<主档 hash>  -> { share: <分享码 hash>, code: "SC-...", createdAt, name }
 *
 * 指针里保存分享码明文，只用于多设备查看同一个只读链接；
 * 主同步码仍然只存哈希。分享端必须校验指针，保证同一主档同时只有一个有效分享码。
 */

const CODE_LENGTH = 16;
const OWNER_PREFIX = 'SG';
const SHARE_PREFIX = 'SC';
const OWNER_KEY_PREFIX = 'holdings:';
const SHARE_KEY_PREFIX = 'share:';
const OWNER_SHARE_KEY_PREFIX = 'shareOwner:';

/**
 * 接受带/不带横线、大小写混写。
 * SG 前缀或 16 位裸码 = 主同步码；SC 前缀 = 分享码。
 */
export function parseCode(input) {
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

export function shareCodeFromRaw(raw) {
  return SHARE_PREFIX + '-' + String(raw).match(/.{4}/g).join('-');
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function ownerKey(hash) { return OWNER_KEY_PREFIX + hash; }
export function shareKey(hash) { return SHARE_KEY_PREFIX + hash; }
export function ownerShareKey(hash) { return OWNER_SHARE_KEY_PREFIX + hash; }

// 分享说明：去首尾空白、压缩连续空白、最多 60 个字符
export function cleanShareName(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 60);
}

export async function loadShared(env, shareCode) {
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

  return { ok: true, doc, name: cleanShareName(ptr.name) };
}

// 分享端不返回墓碑：只读方不需要删除历史，也避免已删除持仓的细节继续外泄
export function sharePayload(doc, shareCode, shareName) {
  return {
    rev: Number(doc.rev) || 0,
    updatedAt: Number(doc.updatedAt) || 0,
    holdings: (Array.isArray(doc.holdings) ? doc.holdings : []).filter((r) => r && !r.deletedAt),
    settings: doc.settings ?? null,
    settingsUpdatedAt: Number(doc.settingsUpdatedAt) || 0,
    empty: false,
    readOnly: true,
    shareCode,
    shareName: cleanShareName(shareName)
  };
}
