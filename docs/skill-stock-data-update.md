# 股票数据更新 Skill

## 概述

SouAGu 项目的股票搜索功能依赖一个本地股票代码库（`stocks-data.js`），包含 A 股、ETF、LOF 的代码、名称、拼音首字母。当有新股上市或股票更名时，需要更新此数据。

## 数据格式

```json
{"c": "688836", "n": "宇树科技", "i": "YSKJ"}
```

- `c`: 6位股票代码
- `n`: 股票简称（规范化后）
- `i`: 拼音首字母（大写）

## 更新流程

### 1. 全量扫描腾讯API

```bash
cd /Users/openclawbot/SouAGu
uv run python stock-data-update/fetch_tencent.py 2>/dev/null > stock-data-update/tmp/tencent_raw.json
```

耗时约2-3分钟，扫描41个千位区间，约39000个代码。

### 2. 合并与更新数据

```bash
uv run python stock-data-update/update_stocks.py
```

输出：
- `stock-data-update/stocks-data.js` - 主数据文件
- `stock-data-update/stocks.json` - JSON格式
- `stock-data-update/UPDATE_REPORT.txt` - 差异报告

### 3. 检查差异报告

```bash
cat stock-data-update/UPDATE_REPORT.txt
```

重点关注：
- 新增股票数量
- 名称被截断的情况（需人工修正）
- 退市股票

### 4. 人工核对（如需）

如果新增股票名称被腾讯截断（带 C/N 前缀 + -U/-W 后缀的长名称），需要：

1. 通过交易所公告核实完整名称
2. 在 `update_stocks.py` 的 `MANUAL_FIX` 字典中添加修正

```python
MANUAL_FIX = {
    '688828': '国仪公司',
    '新代码': '完整名称',
}
```

### 5. 复制到主目录

```bash
cp stock-data-update/stocks-data.js stocks-data.js
cp stock-data-update/stocks.json stocks.json
```

### 6. 更新CDN版本号

修改 `portfolio.html` 中的 CDN 链接版本号：

```html
<script src="https://cdn.jsdelivr.net/gh/mavericklou/SouAGu@vX.X.X/stocks-data.js"></script>
```

### 7. 提交并推送

```bash
git add stocks-data.js stocks.json portfolio.html stock-data-update/
git commit -m "chore: update stocks data (新增XXX等N只股票)"
git push origin master
```

### 8. 发布新版本（可选）

如果需要通过CDN更新：
```bash
git tag vX.X.X
git push origin vX.X.X
```

## 常见问题

### Q: 新股搜不到？
A: 检查代码是否在扫描范围内（41个千位区间），如不在可补充 `fetch_tencent.py` 中的 `PREFIX_RANGES`。

### Q: 名称被截断？
A: 腾讯API对名称有10字节(GBK)限制，超长名称会被截断。需人工核实后加入 `MANUAL_FIX`。

### Q: 拼音不对？
A: 多音字问题在 `POLYPHONIC_FIX` 字典中修正。名称未变的旧记录保留原拼音。

### Q: 运行报错？
A: 确保使用 `uv run python` 而不是 `python3`。

## 相关文件

```
stock-data-update/
├── fetch_tencent.py        # 腾讯全量扫描脚本
├── update_stocks.py        # 主更新脚本
├── st_orig_names.json      # ST股原名称映射
├── stocks-data.js          # 输出：主数据
├── stocks.json             # 输出：JSON
├── UPDATE_REPORT.txt       # 输出：差异报告
└── tmp/
    └── tencent_raw.json    # 扫描原始数据
```

## 更新记录

| 日期 | 新增数量 | 主要新增 |
|------|----------|----------|
| 2026-08-28 | +10 | 宇树科技(688836)、频准激光(688826)等 |
| 2026-08-14 | +0 | 基础数据7460条 |
