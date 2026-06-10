# SouAGu — A股搜索组件

零依赖的 A股 搜索 JavaScript 组件，支持 **代码前缀搜索、拼音首字母搜索、中文名模糊搜索**。双击 HTML 即可使用，或通过 jsDelivr CDN 引用。

## 特性

- **代码搜索** — 输入 `600` 即列出所有 600 开头的股票
- **拼音首字母** — 输入 `ZSYH` → 招商银行
- **中文名模糊** — 输入 `招商` → 招商银行、招商标普等
- **Trie 索引** — 内存高效的前缀匹配，毫秒级响应
- **键盘导航** — ↑↓ 切换，Enter 选中；唯一结果时回车自动填写
- **暗色主题** — 跟随系统或手动指定 `light` / `dark`
- **零依赖** — 无 jQuery、无 React、无 lodash
- **file:// 兼容** — 双击即可用，无需 HTTP 服务器

## 快速开始

```html
<!-- 1. 引入数据 + 组件 -->
<script src="https://cdn.jsdelivr.net/gh/mavericklou/SouAGu@latest/stocks-data.js"></script>
<script src="https://cdn.jsdelivr.net/gh/mavericklou/SouAGu@latest/SouAGu.js"></script>

<!-- 2. 放一个容器 -->
<div id="search"></div>

<script>
  // 3. 实例化
  var ss = new SouAGu('#search', {
    placeholder: '代码/名称/拼音, e.g. 600036 / 招商 / ZSYH',
    theme: 'light',
    width: '100%'
  });

  // 4. 加载数据（file:// 兼容）
  ss.setData(window.__STOCKS_DATA);

  // 5. 监听选中
  ss.onSelect(function(stock) {
    console.log('选中:', stock.n + ' (' + stock.c + ')');
  });
</script>
```

如果运行在 HTTP 服务器上，也可以用 ESM 方式：

```html
<script type="module">
  import { SouAGu } from 'https://cdn.jsdelivr.net/gh/mavericklou/SouAGu@latest/SouAGu.js';
  const ss = new SouAGu('#search');
  await ss.loadData('./stocks.json');
  ss.onSelect(s => console.log(s.n, s.c));
</script>
```

## 数据格式

`stocks-data.js` 暴露全局 `__STOCKS_DATA`，每条记录格式：

```js
{ c: '600036', n: '招商银行', i: 'ZSYH' }
// c = 代码 (code), n = 名称 (name), i = 拼音 (pinyin initials)
```

完整数据约 5700 只（A股 + ETF），~200KB。

## API

### 构造函数

```js
new SouAGu(container, options)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| container | string / HTMLElement | — | CSS 选择器或 DOM 元素 |
| options.placeholder | string | `'搜索代码/名称/拼音'` | 输入框占位文字 |
| options.maxResults | number | `20` | 最大显示结果数 |
| options.debounceMs | number | `100` | 输入防抖毫秒 |
| options.autoSelect | boolean | `false` | 唯一匹配时自动选中 |
| options.theme | string | `'auto'` | `'auto'` / `'light'` / `'dark'` |
| options.width | string | `'320px'` | 组件宽度 CSS 值 |
| options.zIndex | string | `'99999'` | 下拉框 z-index |
| options.inputClass | string | `''` | 输入框额外 CSS class |
| options.dropdownClass | string | `''` | 下拉框额外 CSS class |

### 方法

| 方法 | 说明 |
|------|------|
| `.loadData(url)` | 从 URL 或数组加载数据，返回 Promise |
| `.setData(array)` | 直接设置数据（file:// 方式），返回 this |
| `.search(query)` | 手动搜索，返回结果数组 |
| `.getSelected()` | 获取当前选中的股票对象 |
| `.clear()` | 清空输入和选中 |
| `.focus()` | 聚焦输入框 |
| `.onSelect(fn)` | 选中回调，返回 this |
| `.onInput(fn)` | 输入回调 `fn({query, results})`，返回 this |
| `.getData()` | 获取原始数据数组 |
| `.destroy()` | 释放资源 |

### 选中回调的 stock 对象

```js
{
  c: '600036', // 股票代码
  n: '招商银行', // 股票名称
  i: 'ZSYH'     // 拼音首字母
}
```

## 文件说明

| 文件 | 说明 |
|------|------|
| **SouAGu.js** | 核心搜索组件，零依赖，Trie 索引 + 下拉框 UI |
| **stocks-data.js** | 全市场数据（~5700 只 A股 + ETF），~200KB |
| **stocks.json** | 同数据，JSON 格式（用于 ESM / fetch 加载） |
| **index.html** | 搜索组件的独立演示页面 |
| **portfolio.html** | 示例应用：个人股票持仓管理（localStorage 存储、实时行情、盈亏计算） |
| **README.md** | 本文件 |

## 浏览器支持

支持所有现代浏览器（Chrome、Firefox、Safari、Edge）。

## License

MIT