# SouAGu 云同步（Cloudflare Pages）

`portfolio.html` 的云端同步后端：一个 Pages Function + 一个 KV namespace，无数据库、无账号体系。

## 目录

```
souagu-cf/
├── functions/api/sync.js   # GET / PUT / OPTIONS
├── public/                 # 由 deploy.sh 生成（已 gitignore）
├── wrangler.toml
├── deploy.sh
└── test/                   # 本地单元测试（不参与部署）
```

## 一、部署（路线 A，自己执行）

```bash
cd souagu-cf

# 1. 登录 Cloudflare（浏览器授权）
npx wrangler login

# 2. 创建 KV namespace，记下返回的 id
npx wrangler kv namespace create HOLDINGS

# 3. 创建 Pages 项目（只需一次）
npx wrangler pages project create souagu --production-branch main

# 4. 构建并部署
./deploy.sh
```

`deploy.sh` 会：

1. 把仓库根目录的 `portfolio.html` 复制成 `public/index.html` 和 `public/portfolio.html`
2. 复制 `manifest.json` / 图标
3. 如果 `wrangler.toml` 里 KV id 还是占位符，自动从账号里查 `HOLDINGS` 并填入
4. 执行 `wrangler pages deploy public --project-name souagu`

部署完成后访问 `https://souagu.pages.dev`（或分配到的域名），点页面右上角「同步」即可。

> 如果你暂时还在 GitHub Pages（`*.github.io`）上使用，该域名默认不放行云同步：展开「高级：自定义服务地址」，填写 `https://souagu.pages.dev/api/sync`（只填域名也会自动补 `/api/sync`，输入即保存），保存后再点「生成新同步码」。

### 如果 KV 绑定没有生效

Dashboard → Workers & Pages → `souagu` → Settings → Functions → **KV namespace bindings**：

- Variable name: `HOLDINGS`
- KV namespace: 选择第 2 步创建的

绑定后**必须重新部署一次**（`./deploy.sh`）。

### 常见问题

- **提示「当前页面无法访问同步服务」**：说明页面运行在 `file://` 或 `*.github.io` 下且没有保存自定义地址。请展开「高级」，填写 `https://你的域名/api/sync`（只填域名会自动补 `/api/sync`），输入后即自动保存，再点生成/连接。
- **提示「服务返回 HTTP 404」**：自定义地址路径不对，或 Pages Function 尚未随静态文件一起部署。确认地址是 `https://你的域名/api/sync`，并重新执行 `./deploy.sh`。

### 自定义域名

Dashboard → `souagu` → Custom domains → Set up a custom domain。

## 二、接口

```
GET  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
  → 200 { rev, updatedAt, holdings, settings, settingsUpdatedAt }

PUT  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
  body { rev, holdings, settings, settingsUpdatedAt }
  → 200 { rev: rev+1 }
  → 409 { rev, holdings, settings, settingsUpdatedAt }   // 附带服务端全文
```

- 同步码不区分大小写、可省略横线，服务端统一规范化为 `SG-XXXX-XXXX-XXXX-XXXX`
- KV key = `holdings:` + SHA-256(规范化同步码)，**不存明文**
- `rev` 乐观锁：PUT 的 `rev` 必须等于云端当前值
- 单档上限 256 KB，最多 5000 条
- `expirationTtl` 365 天，每次写入自动续期
- 响应 `Cache-Control: no-store`
- 无 Cookie、无账号；同步码即密钥

## 三、首次运行行为

| 本地 | 云端 | 行为 |
|------|------|------|
| 有 | 空 | 弹窗确认后上传为初始数据 |
| 空 | 有 | 直接下拉 |
| 有 | 有 | 三选一：合并（按 ID）/ 以云端为准（推荐）/ 以本地为准 |
| 空 | 空 | 正常空档 |

任何覆盖/合并前都会自动备份到 `localStorage` 的 `portfolio_backup_<时间戳>`，弹窗底部可恢复最近一次备份。

绑定成功后记录 `synced:<codeHash>=true`，之后打开页面静默增量合并，不再弹窗。

## 四、日常同步策略

- 持仓增删、导入、费率修改后 **debounce 5 秒** 推送
- **行情刷新（lastPrice / lastChangePct）绝不触发云端写入**
- 内容 hash 与上次推送一致时跳过写入（节省 KV 写额度）
- 冲突（409）时按 `id + updatedAt` 合并，墓碑（`deletedAt`）优先，最多重试 3 次
- 离线不阻塞：本地照常使用，`online` 事件或下次打开页面时自动重试

## 五、免费额度

| 资源 | 免费额度 | 说明 |
|------|----------|------|
| Workers 请求 | 10 万/天 | 够用 |
| KV 读 | 10 万/天 | 够用 |
| **KV 写** | **1000/天** | 瓶颈；debounce + hash 去重后个人足够 |
| KV 存储 | 1 GB | 5 KB/档约 20 万档 |

> KV 是最终一致性（全球最长约 60 秒可见）。个人低频修改足够；需要强一致需换 D1 / Durable Objects。

## 六、本地测试

```bash
cd souagu-cf
node --test test/*.test.mjs
```

- `sync-core.test.mjs`：从 `portfolio.html` 提取同步核心逻辑，测试合并/墓碑/去重/哈希
- `worker.test.mjs`：用内存 KV mock 测试 GET / PUT / 409 / 校验
