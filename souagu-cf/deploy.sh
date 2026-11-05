#!/usr/bin/env bash
# 一键构建并部署到 Cloudflare Pages
#
# 首次使用：
#   npx wrangler login
#   npx wrangler kv namespace create HOLDINGS
#   ./deploy.sh
#
# 之后每次部署：
#   ./deploy.sh

set -euo pipefail
cd "$(dirname "$0")"

ROOT="$(cd .. && pwd)"
PROJECT="${PAGES_PROJECT:-souagu}"

echo "==> 准备静态文件"
mkdir -p public
cp "$ROOT/portfolio.html" public/index.html
cp "$ROOT/portfolio.html" public/portfolio.html
cp "$ROOT/manifest.json" public/manifest.json
cp "$ROOT/icon-192.png" public/icon-192.png
cp "$ROOT/icon-512.png" public/icon-512.png
if [ -f "$ROOT/cover.png" ]; then cp "$ROOT/cover.png" public/cover.png; fi

echo "==> 检查 KV 绑定"
if grep -q "REPLACE_WITH_KV_ID" wrangler.toml; then
  echo "    正在从 Cloudflare 账号查询 HOLDINGS 的 namespace id…"
  KV_ID="$(npx wrangler kv namespace list 2>/dev/null | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const list = JSON.parse(s);
        const hit = list.find((x) => x.title === "HOLDINGS" || x.title === "souagu-HOLDINGS");
        if (hit && hit.id) process.stdout.write(hit.id);
      } catch (e) {}
    });
  ')"
  if [ -n "${KV_ID}" ]; then
    perl -pi -e "s/REPLACE_WITH_KV_ID/${KV_ID}/g" wrangler.toml
    echo "    已写入 wrangler.toml：HOLDINGS=${KV_ID}"
  else
    echo "❌ 没有找到名为 HOLDINGS 的 KV namespace。"
    echo "   请先执行：npx wrangler kv namespace create HOLDINGS"
    echo "   然后把返回的 id 填进 wrangler.toml 的 REPLACE_WITH_KV_ID，或到 Pages 控制台手动绑定。"
    exit 1
  fi
fi

echo "==> 部署 Pages 项目：${PROJECT}"
npx wrangler pages deploy public \
  --project-name "$PROJECT" \
  --branch main \
  --commit-dirty=true

echo
echo "✅ 部署完成"
echo "   首次部署后请到 Cloudflare Dashboard 检查："
echo "   Workers & Pages → ${PROJECT} → Settings → Functions → KV namespace bindings"
echo "   确认 HOLDINGS 已绑定；若手动绑定过，需要再重新部署一次。"
