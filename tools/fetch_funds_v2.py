#!/usr/bin/env python3
"""
获取 A股 场内 ETF + LOF 基金列表
数据源: 东方财富 fundcode_search.js（静态CDN文件）
Tencent qt.gtimg.cn 验证是否可交易
输出 stdout: JSON 数组 [{c,x,n,i}]
"""

import urllib.request, json, re, gzip

def fetch(url):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0')
    resp = urllib.request.urlopen(req, timeout=15)
    data = resp.read()
    if resp.headers.get('Content-Encoding') == 'gzip':
        data = gzip.decompress(data)
    return data.decode('utf-8', errors='replace')

# ---- 1. 获取场内基金列表 ----
js = fetch('https://fund.eastmoney.com/js/fundcode_search.js')
m = re.search(r'var r = (\[.*?\])\s*;', js, re.DOTALL)
all_funds = json.loads(m.group(1))

# 场内基金前缀
PREFIXES = ('159', '16', '51', '56', '58')
# 排除的B类货币基金
EXCLUDE_NAMES = ('易方达保证金货币B', '招商保证金快线B', '汇添富收益快钱货币B',
                 '南方理财金H', '华宝添益B', '银华日利B', '建信添益B',
                 '交易货币B', '理财金H')

funds = [(f[0], f[2]) for f in all_funds 
         if f[0].startswith(PREFIXES) and f[2] not in EXCLUDE_NAMES]
funds.sort(key=lambda x: x[0])
print(f'# 初始抓取: {len(funds)} 只', file=__import__('sys').stderr)

# ---- 2. 腾讯验证 ----
from pypinyin import lazy_pinyin, Style

BATCH = 400
valid = set()
invalid = 0

for start in range(0, len(funds), BATCH):
    batch = funds[start:start+BATCH]
    params = [('sh' if c.startswith(('60','68','51','56','58')) else 'sz') + c 
              for c, _ in batch]
    url = f'http://qt.gtimg.cn/q={",".join(params)}'
    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0')
        resp = urllib.request.urlopen(req, timeout=10)
        raw = resp.read().decode('gbk', errors='replace')
        for line in raw.strip().strip(';').split(';'):
            eq = line.find('=')
            if eq < 0: continue
            val = line[eq+1:].strip().strip('"').split('~')
            if len(val) >= 4 and val[2] != '0':
                valid.add(val[0])
    except Exception as e:
        print(f'# 批次失败: {e}', file=__import__('sys').stderr)
    invalid = len(funds) - len(valid)
    print(f'# 进度: {start+BATCH}/{len(funds)}, 有效={len(valid)}, 无效={invalid}', file=__import__('sys').stderr)

print(f'# 腾讯验证完成: 有效={len(valid)}, 无效={invalid}', file=__import__('sys').stderr)

# ---- 3. 拼音首字母 + 输出 ----
output = []
for code, name in funds:
    if code not in valid:
        continue
    py = ''.join(lazy_pinyin(name, style=Style.FIRST_LETTER)).upper()
    output.append({"c": code, "n": name, "i": py})

print(json.dumps(output, ensure_ascii=False, separators=(',', ':')))

print(f'# 输出: {len(output)} 条', file=__import__('sys').stderr)
