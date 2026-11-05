# SouAGu 云同步（Cloudflare Pages）

`portfolio.html` 的云端同步后端：一个 Pages Function + 一个 KV namespace，无数据库、无账号体系。

## 目录

```
souagu-cf/
├── functions/_lib/share.js # 分享码解析 / KV key / 分享读取公共逻辑
├── functions/api/sync.js   # 主档 GET / PUT（只处理 SG-）
├── functions/api/shared.js # 只读分享快照 GET /api/shared（只处理 SC-）
├── functions/api/share.js  # 分享码 GET / POST / DELETE（管理）
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

### 主同步码

```
GET  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
  → 200 { rev, updatedAt, holdings, settings, settingsUpdatedAt, readOnly: false }

PUT  /api/sync?code=SG-XXXX-XXXX-XXXX-XXXX
  body { rev, holdings, settings, settingsUpdatedAt }
  → 200 { rev: rev+1 }
  → 409 { rev, holdings, settings, settingsUpdatedAt }   // 附带服务端全文
```

### 只读分享

分享内容统一走独立接口，`/api/sync` 不再返回任何分享数据：

```
GET  /api/shared?code=SC-XXXX-XXXX-XXXX-XXXX
  → 200 { rev, updatedAt, holdings, settings, settingsUpdatedAt, empty:false, readOnly:true, shareCode, shareName }
  → 400 不是明确的分享码（主码或裸 16 位码）
  → 404 分享码无效 / 已撤销 / 已轮换

GET  /api/sync?code=SC-XXXX-XXXX-XXXX-XXXX
  → 400 分享码请使用只读分享链接打开

PUT  /api/sync?code=SC-XXXX-XXXX-XXXX-XXXX
  → 403 分享码只有只读权限，不能上传修改
```

分享码管理（只能使用主同步码调用）：

```
GET    /api/share?code=SG-...
  → 200 { configured: true|false, shareCode, shareName, createdAt }
    // shareCode 为当前分享码明文；其他设备据此显示同一个只读链接

POST   /api/share?code=SG-...
  body { shareCode: "SC-XXXX-XXXX-XXXX-XXXX", shareName?: "分享说明" }
  → 200 { shareCode, shareName, createdAt }  // 生成 / 轮换（旧码立即失效）/ 只改说明
  → 409 分享码已被占用

DELETE /api/share?code=SG-...
  → 200 { revoked: true|false }
```

- 主码格式 `SG-XXXX-XXXX-XXXX-XXXX`，分享码格式 `SC-XXXX-XXXX-XXXX-XXXX`，均为 16 位 Base32（约 80 bit）
- 同步码/分享码不区分大小写、可省略横线；`/api/shared` 只接受明确的 `SC-` 前缀，裸 16 位码按主同步码处理
- KV key = `holdings:` + SHA-256(规范化主码)，**主同步码不存明文**
- 分享映射：`share:` + SHA-256(分享码) → `{ owner, createdAt, name }`；反向指针 `shareOwner:` + SHA-256(主码) → `{ share, code, createdAt, name }`
- 反向指针里保存分享码明文（`code`）和分享说明（`name`），只用于让同一主码的其他设备显示同一个只读链接；**主同步码仍只存哈希**
- 分享说明会去首尾空白、压缩连续空白，最多 60 个字符；可为空
- 分享端 GET 必须校验反向指针，**同一个主档同时只有一个有效分享码**；轮换或撤销后旧码立即失效
- 分享数据包含完整持仓与成本价、费率设置；历史墓碑会被过滤，不向只读端返回
- 只读端只在内存中预览，**不写入**任何 `localStorage` 数据，也不会发起 PUT
- `rev` 乐观锁：PUT 的 `rev` 必须等于云端当前值
- 单档上限 256 KB，最多 5000 条
- `expirationTtl` 365 天，每次写入自动续期
- 响应 `Cache-Control: no-store`
- 无 Cookie、无账号；同步码即密钥，分享码即只读凭证

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

## 五、只读分享链接

主同步码持有者在「同步」弹窗底部点击「生成分享链接」，得到：

```
https://<页面域名与路径>#share=SC-XXXX-XXXX-XXXX-XXXX
```

- 链接使用 `#share=` hash，**不会进入服务器访问日志**；分享码也不会以路径/查询参数形式发送
- 页面与同步服务不同域、或配置了自定义服务地址时，链接会自动追加 `&api=<URL 编码后的 /api/shared 地址>`
- 对方打开链接后进入同一个 `portfolio.html` 的**只读预览模式**：在内存中显示分享者的持仓、成本价和费率，**不写入对方的 `portfolio_holdings`、费率、同步配置、`synced:` 标记或自动备份**
- 只读预览保留搜索、排序、合并、导出；隐藏删除，禁用添加/导入/设置/数量/成本输入；同步按钮隐藏，不会触发查看者自己的云同步
- 预览页顶部横幅可「刷新」拉取最新快照，「退出预览」会清除 hash 并回到对方自己的数据
- 生成分享时可填写一段「分享说明」（最多 60 字），只读页顶部横幅和浏览器标题会显示它，而不只是「持仓助手」
- 任意持有主码的设备打开同步弹窗时，会向 `/api/share` 查询当前分享码，因此其他设备生成的分享码/链接也能直接显示和复制
- **同一主档同时只能有一个有效分享码**：重新生成会自动轮换，旧链接立即失效；撤销后已打开的页面刷新会提示失效
- 成本价属于分享内容，**完全公开**，不做隐藏
- 主同步输入框只接受 `SG-...` 主码；输入 `SC-...` 会提示改用分享链接，不再支持用分享码连接

### 多主码与昵称

- 页面顶部有主码下拉框，可在多个 `SG-...` 主码之间切换；每个主码可设一个最多 12 个字的昵称（未设置时显示主码末 4 位）
- 每个主码拥有独立的本地档案（持仓、费率、同步状态），切换时整页重载，**不会把 A 主码的持仓合并进 B 主码**
- 「＋ 添加主码…」会新建空档案并自动进入首次连接流程；老用户第一个主码继续沿用旧存储 key，不会丢数据
- 只读分享预览中不显示主码下拉框，也不会写入任何档案信息

> KV 最终一致性（全球最长约 60 秒）：分享码生成/撤销/轮换可能有短暂延迟。分享端每次刷新约 3 次 KV 读。

## 六、免费额度

| 资源 | 免费额度 | 说明 |
|------|----------|------|
| Workers 请求 | 10 万/天 | 够用 |
| KV 读 | 10 万/天 | 够用 |
| **KV 写** | **1000/天** | 瓶颈；debounce + hash 去重后个人足够 |
| KV 存储 | 1 GB | 5 KB/档约 20 万档 |

> KV 是最终一致性（全球最长约 60 秒可见）。个人低频修改足够；需要强一致需换 D1 / Durable Objects。

## 七、本地测试

```bash
cd souagu-cf
node --test test/*.test.mjs
```

- `sync-core.test.mjs`：从 `portfolio.html` 提取同步核心逻辑，测试合并/墓碑/去重/哈希/分享码格式
- `worker.test.mjs`：用内存 KV mock 测试主档 GET / PUT / 409 / 校验
- `share.test.mjs`：`/api/shared` 只读快照与分享说明、`/api/sync` 对 SC 返回 400、SC PUT 403、`/api/share` 返回当前分享码明文、轮换/撤销/单码约束、墓碑过滤
