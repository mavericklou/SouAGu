/**
 * SouAGu.js — A股股票搜索组件
 *
 * 功能：
 * - 代码前缀搜索（如 "600" → 所有600开头的股票）
 * - 拼音首字母搜索（如 "ZSYH" → 招商银行）
 * - 中文名模糊搜索（如 "招商" → 招商银行、招商标普等）
 * - 下拉框键盘导航（上下箭头+回车）
 * - 支持普通 <script> 标签加载（file:// 兼容）
 *
 * 使用方式（双击打开）：
 *   <script src="./stocks-data.js"></script>
 *   <script src="./SouAGu.js"></script>
 *   <script>
 *     const ss = new SouAGu('#search');
 *     ss.setData(__STOCKS_DATA);
 *     ss.onSelect(stock => console.log('选中:', stock));
 *   </script>
 *
 * 使用方式（HTTP服务器）：
 *   <script type="module">
 *     import { SouAGu } from './SouAGu.js';
 *     const ss = new SouAGu('#search');
 *     await ss.loadData('./stocks.json');
 *     ss.onSelect(stock => console.log('选中:', stock));
 *   </script>
 */

(function(global) {
  'use strict';

  class SouAGu {
    /**
     * @param {string|HTMLElement} container - CSS选择器或DOM元素
     * @param {object} options
     * @param {string} options.placeholder - 输入框占位文字 (默认: '搜索代码/名称/拼音')
     * @param {number} options.maxResults - 最大显示结果数 (默认: 20)
     * @param {number} options.debounceMs - 输入防抖毫秒 (默认: 100)
     * @param {boolean} options.autoSelect - 唯一匹配时自动选中 (默认: false)
     * @param {string} options.theme - 'auto' | 'light' | 'dark' (默认: 'auto')
     * @param {string} options.width - 组件宽度 CSS 值 (默认: '320px')
     * @param {string} options.zIndex - 下拉框 z-index (默认: '99999')
     * @param {string} options.inputClass - 输入框额外 CSS class
     * @param {string} options.dropdownClass - 下拉框额外 CSS class
     */
    constructor(container, options = {}) {
      this._container = typeof container === 'string'
        ? document.querySelector(container)
        : container;
      if (!this._container) throw new Error('SouAGu: container not found');

      this._opt = {
        placeholder: '搜索代码/名称/拼音',
        maxResults: 20,
        debounceMs: 100,
        autoSelect: false,
        theme: 'auto',
        width: '320px',
        zIndex: '99999',
        inputClass: '',
        dropdownClass: '',
        ...options,
      };

      /** @type {Array<{c:string,n:string,i:string}>} */
      this._data = [];
      this._trie = this._createNode();
      this._selectedStock = null;
      this._callbacks = { select: [], input: [] };
      this._indexBuilt = false;
      this._debounceTimer = null;

      this._buildDOM();
      this._bindEvents();
      this._injectStyle();
    }

    /* ==================== 公开 API ==================== */

    /** 从 URL 或数组加载数据 */
    loadData(source) {
      var self = this;
      if (typeof source === 'string') {
        return fetch(source)
          .then(function(resp) { if (!resp.ok) throw new Error('SouAGu: fetch failed (' + resp.status + ')'); return resp.json(); })
          .then(function(json) {
            self._data = Array.isArray(json) ? json : (json.data || json.stocks || []);
            self._buildIndex();
            return self;
          });
      } else if (Array.isArray(source)) {
        self._data = source;
        self._buildIndex();
        return Promise.resolve(self);
      } else {
        return Promise.reject(new Error('SouAGu: source must be URL string or array'));
      }
    }

    /** 直接设置数据（file:// 兼容方式，从 __STOCKS_DATA 加载） */
    setData(data) {
      this._data = Array.isArray(data) ? data : [];
      this._buildIndex();
      return this;
    }

    /** 搜索 */
    search(query) {
      return this._search(query);
    }

    /** 获取当前选中 */
    getSelected() {
      return this._selectedStock;
    }

    /** 清空输入和选中 */
    clear() {
      this._input.value = '';
      this._selectedStock = null;
      this._hideDropdown();
      this._clearBtn.style.display = 'none';
    }

    /** 聚焦输入 */
    focus() {
      this._input.focus();
    }

    /** 选中回调 */
    onSelect(callback) {
      this._callbacks.select.push(callback);
      return this;
    }

    /** 输入回调 {query, results} */
    onInput(callback) {
      this._callbacks.input.push(callback);
      return this;
    }

    /** 获取原始数据 */
    getData() {
      return this._data;
    }

    /** 释放资源 */
    destroy() {
      this._input.removeEventListener('input', this._boundOnInput);
      this._input.removeEventListener('keydown', this._boundOnKeydown);
      document.removeEventListener('click', this._boundOnDocClick);
      this._container.innerHTML = '';
      this._data = [];
      this._trie = null;
    }

    /* ==================== Trie 索引 ==================== */

    _createNode() {
      return { children: {}, results: [] };
    }

    _buildIndex() {
      this._trie = this._createNode();
      var data = this._data;
      for (var i = 0; i < data.length; i++) {
        var s = data[i];
        if (s.c) this._insert(s.c, s);
        if (s.i) this._insert(s.i.toUpperCase(), s);
      }
      this._indexBuilt = true;
    }

    _insert(key, stock) {
      var node = this._trie;
      for (var i = 0; i < key.length; i++) {
        var ch = key[i];
        if (!node.children[ch]) node.children[ch] = this._createNode();
        node = node.children[ch];
        // Store stock ref at this node
        var found = false;
        for (var j = 0; j < node.results.length; j++) {
          if (node.results[j].c === stock.c) { found = true; break; }
        }
        if (!found) node.results.push(stock);
      }
    }

    _trieSearch(prefix) {
      if (!prefix) return [];
      var node = this._trie;
      for (var i = 0; i < prefix.length; i++) {
        if (!node.children[prefix[i]]) return [];
        node = node.children[prefix[i]];
      }
      return node.results;
    }

    _search(q) {
      var query = q.trim();
      if (!query) return [];

      var seen = {};
      var results = [];
      var maxR = this._opt.maxResults;

      function add(stock) {
        if (!seen[stock.c] && results.length < maxR) {
          seen[stock.c] = true;
          results.push(stock);
        }
      }

      // 1. Trie 搜索（代码 + 拼音首字母）
      var upper = query.toUpperCase();
      var trieResults = this._trieSearch(upper);
      for (var i = 0; i < trieResults.length; i++) add(trieResults[i]);

      if (results.length >= maxR) return results;

      // 2. 中文名称子串搜索
      if (/[\u4e00-\u9fff]/.test(query)) {
        for (var i = 0; i < this._data.length; i++) {
          if (results.length >= maxR) break;
          var s = this._data[i];
          if (s.n && s.n.indexOf(query) !== -1 && !seen[s.c]) add(s);
        }
      }

      // 3. 纯数字补0对齐搜索
      if (/^\d{1,6}$/.test(query)) {
        var padded = query;
        while (padded.length < 6) padded = '0' + padded;
        for (var i = 0; i < this._data.length; i++) {
          if (results.length >= maxR) break;
          var s = this._data[i];
          if (s.c && s.c.indexOf(padded) !== -1 && !seen[s.c]) add(s);
        }
      }

      return results;
    }

    /* ==================== DOM 构建 ==================== */

    _buildDOM() {
      this._container.innerHTML = '<div class="ss-wrapper" style="position:relative;width:' + this._opt.width + '">' +
        '<div class="ss-input-wrapper" style="position:relative">' +
          '<input class="ss-input ' + this._opt.inputClass + '" type="text" placeholder="' + this._opt.placeholder + '" autocomplete="off" spellcheck="false" style="width:100%;box-sizing:border-box;">' +
          '<span class="ss-clear" style="display:none;position:absolute;right:8px;top:50%;transform:translateY(-50%);cursor:pointer;font-size:16px;line-height:1;color:#999;user-select:none;">&times;</span>' +
        '</div>' +
        '<div class="ss-dropdown ' + this._opt.dropdownClass + '" style="display:none;position:absolute;top:100%;left:0;min-width:100%;z-index:' + this._opt.zIndex + ';max-height:360px;overflow-y:auto;"></div>' +
      '</div>';

      this._wrapper = this._container.querySelector('.ss-wrapper');
      this._input = this._container.querySelector('.ss-input');
      this._clearBtn = this._container.querySelector('.ss-clear');
      this._dropdown = this._container.querySelector('.ss-dropdown');
    }

    _injectStyle() {
      var id = '__SouAGu_style';
      if (document.getElementById(id)) return;

      var isDark = this._opt.theme === 'dark' ||
        (this._opt.theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

      var style = document.createElement('style');
      style.id = id;
      style.textContent = '' +
        '.ss-input {' +
          'padding: 8px 32px 8px 12px;' +
          'border: 1px solid ' + (isDark ? '#444' : '#d0d5dd') + ';' +
          'border-radius: 8px;' +
          'font-size: 14px;' +
          'outline: none;' +
          'background: ' + (isDark ? '#1a1a2e' : '#fff') + ';' +
          'color: ' + (isDark ? '#e0e0e0' : '#1a1a2e') + ';' +
          'transition: border-color .2s, box-shadow .2s;' +
        '}' +
        '.ss-input:focus {' +
          'border-color: ' + (isDark ? '#7c5cfc' : '#5b5bd7') + ';' +
          'box-shadow: 0 0 0 3px ' + (isDark ? 'rgba(124,92,252,.25)' : 'rgba(91,91,215,.15)') + ';' +
        '}' +
        '.ss-input::placeholder { color: ' + (isDark ? '#666' : '#aaa') + '; }' +
        '.ss-dropdown {' +
          'background: ' + (isDark ? '#1a1a2e' : '#fff') + ';' +
          'border: 1px solid ' + (isDark ? '#333' : '#e0e0e0') + ';' +
          'border-radius: 8px;' +
          'box-shadow: ' + (isDark ? '0 8px 24px rgba(0,0,0,.4)' : '0 8px 24px rgba(0,0,0,.12)') + ';' +
          'margin-top: 4px;' +
          'padding: 4px 0;' +
          'width: max-content;' +
          'max-width: min(100vw - 20px, 600px);' +
        '}' +
        '.ss-item {' +
          'display: flex; align-items: center; gap: 10px;' +
          'padding: 8px 14px; cursor: pointer;' +
          'color: ' + (isDark ? '#ccc' : '#333') + ';' +
          'transition: background .1s;' +
        '}' +
        '.ss-item:hover, .ss-item.active {' +
          'background: ' + (isDark ? 'rgba(124,92,252,.2)' : 'rgba(91,91,215,.08)') + ';' +
        '}' +
        '.ss-item .ss-code {' +
          'font-family: "SF Mono", "Fira Code", "Courier New", monospace;' +
          'font-size: 12px; color: ' + (isDark ? '#888' : '#888') + ';' +
          'min-width: 64px;' +
        '}' +
        '.ss-item .ss-name { flex: 1; font-size: 14px; white-space: nowrap; }' +
        '.ss-item .ss-name .hl { color: ' + (isDark ? '#f0c040' : '#d4380d') + '; }' +
        '.ss-item .ss-pinyin { font-size: 11px; color: ' + (isDark ? '#666' : '#bbb') + '; font-family: monospace; }' +
        '.ss-item .ss-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; background: ' + (isDark ? '#2a2a3e' : '#f0f0f5') + '; color: ' + (isDark ? '#999' : '#888') + '; }' +
        '.ss-no-results { padding: 20px 14px; text-align: center; color: ' + (isDark ? '#666' : '#aaa') + '; font-size: 13px; }' +
        '.ss-clear:hover { color: ' + (isDark ? '#fff' : '#333') + ' !important; }';
      document.head.appendChild(style);
    }

    /* ==================== 事件绑定 ==================== */

    _bindEvents() {
      var self = this;

      this._boundOnInput = function() { self._onInput(); };
      this._boundOnKeydown = function(e) { self._onKeydown(e); };
      this._boundOnDocClick = function(e) { self._onDocClick(e); };

      this._input.addEventListener('input', this._boundOnInput);
      this._input.addEventListener('keydown', this._boundOnKeydown);
      document.addEventListener('click', this._boundOnDocClick);

      this._clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        self.clear();
        self._input.focus();
      });
    }

    _onInput() {
      var self = this;
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(function() {
        var q = self._input.value;
        if (!q) {
          self._hideDropdown();
          self._clearBtn.style.display = 'none';
          self._selectedStock = null;
          return;
        }
        self._clearBtn.style.display = 'block';
        var items = self._search(q);
        self._renderDropdown(items, q);

        for (var i = 0; i < self._callbacks.input.length; i++) {
          self._callbacks.input[i]({ query: q, results: items });
        }

        if (self._opt.autoSelect && items.length === 1) {
          self._selectStock(items[0]);
        }
      }, this._opt.debounceMs);
    }

    _onKeydown(e) {
      if (!this._dropdown.style.display || this._dropdown.style.display === 'none') return;
      var items = this._dropdown.querySelectorAll('.ss-item');
      if (!items.length) return;

      var active = this._dropdown.querySelector('.ss-item.active');
      var idx = -1;
      if (active) { for (var i = 0; i < items.length; i++) { if (items[i] === active) { idx = i; break; } } }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          idx = Math.min(idx + 1, items.length - 1);
          this._setActive(items, idx);
          break;
        case 'ArrowUp':
          e.preventDefault();
          idx = Math.max(idx - 1, 0);
          this._setActive(items, idx);
          break;
        case 'Enter':
          e.preventDefault();
          if (active) {
            var c = active.dataset.code;
            for (var i = 0; i < this._data.length; i++) {
              if (this._data[i].c === c) { this._selectStock(this._data[i]); break; }
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          this._hideDropdown();
          break;
      }
    }

    _onDocClick(e) {
      if (this._wrapper && !this._wrapper.contains(e.target)) {
        this._hideDropdown();
      }
    }

    /* ==================== 下拉渲染 ==================== */

    _renderDropdown(items, query) {
      if (!items.length) {
        this._dropdown.innerHTML = '<div class="ss-no-results">无匹配结果</div>';
        this._dropdown.style.display = 'block';
        return;
      }

      var html = '';
      for (var i = 0; i < items.length; i++) {
        var s = items[i];
        var name = s.n || '';
        var code = s.c || '';
        var pinyin = (s.i || '').toLowerCase();

        // 高亮匹配部分
        var displayName = name;
        if (/[\u4e00-\u9fff]/.test(query)) {
          var idx = name.indexOf(query);
          if (idx !== -1) {
            displayName = name.slice(0, idx) +
              '<span class="hl">' + name.slice(idx, idx + query.length) + '</span>' +
              name.slice(idx + query.length);
          }
        }

        var badge = code.charAt(0) === '6' || code.charAt(0) === '9' ? 'SH' :
                    code.charAt(0) === '0' || code.charAt(0) === '3' ? 'SZ' : 'BJ';

        html += '<div class="ss-item" data-code="' + code + '">' +
          '<span class="ss-code">' + code + '</span>' +
          '<span class="ss-name">' + displayName + '</span>' +
          '<span class="ss-pinyin">' + pinyin + '</span>' +
          '<span class="ss-badge">' + badge + '</span>' +
        '</div>';
      }
      this._dropdown.innerHTML = html;
      this._dropdown.style.display = 'block';

      // 绑定点击
      var self = this;
      var itemsEl = this._dropdown.querySelectorAll('.ss-item');
      for (var i = 0; i < itemsEl.length; i++) {
        (function(el) {
          el.addEventListener('mousedown', function(e) {
            e.preventDefault();
            var c = el.dataset.code;
            for (var j = 0; j < self._data.length; j++) {
              if (self._data[j].c === c) { self._selectStock(self._data[j]); break; }
            }
          });
        })(itemsEl[i]);
      }
    }

    _setActive(items, idx) {
      for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }

    _selectStock(stock) {
      this._selectedStock = stock;
      this._input.value = stock.n + ' (' + stock.c + ')';
      this._hideDropdown();
      for (var i = 0; i < this._callbacks.select.length; i++) {
        this._callbacks.select[i](stock);
      }
    }

    _hideDropdown() {
      this._dropdown.style.display = 'none';
    }
  }

  /* ==================== 导出 ==================== */

  // 暴露到全局（支持普通 <script> 标签，file:// 兼容）
  global.SouAGu = SouAGu;

  // CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SouAGu: SouAGu };
  }

})(typeof window !== 'undefined' ? window : this);
