#!/usr/bin/env python3
"""
第一步：获取全部场内基金候选列表（东方财富 fundcode_search.js 静态文件）
第二步：用腾讯 qt.gtimg.cn 批量验证哪些是实际可交易代码
输出: stdout - JSON [{c,n,i}]（仅含通过腾讯验证的）
"""

import urllib.request, json, re, gzip, sys

def fetch(url):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0')
    resp = urllib.request.urlopen(req, timeout=15)
    data = resp.read()
    if resp.headers.get('Content-Encoding') == 'gzip':
        data = gzip.decompress(data)
    return data.decode('utf-8', errors='replace')

# 1. 从东方财富获取全量基金列表
print('# 下载基金列表...', file=sys.stderr)
js = fetch('https://fund.eastmoney.com/js/fundcode_search.js')
m = re.search(r'var r = (\[.*?\])\s*;', js, re.DOTALL)
all_funds = json.loads(m.group(1))

# 筛选场内基金代码前缀
PREFIXES = ('159', '16', '51', '56', '58')
NON_TRADABLE = {
    '易方达保证金货币B', '招商保证金快线B', '汇添富收益快钱货币B',
    '南方理财金H', '华宝添益B', '银华日利B', '建信添益B',
    '交易货币B', '理财金H',
}
funds = [(f[0], f[2]) for f in all_funds
         if f[0].startswith(PREFIXES) and f[2] not in NON_TRADABLE]
funds.sort(key=lambda x: x[0])
print(f'# 候选: {len(funds)} 只', file=sys.stderr)

# 2. 腾讯批量验证
BATCH = 400
valid = set()

for start in range(0, len(funds), BATCH):
    batch = funds[start:start+BATCH]
    params = [('sh' if c.startswith(('60','68','51','56','58')) else 'sz') + c
              for c, _ in batch]
    url = f'http://qt.gtimg.cn/q={",".join(params)}'
    try:
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Mozilla/5.0')
        resp = urllib.request.urlopen(req, timeout=15)
        raw = resp.read().decode('gbk', errors='replace')
        for line in raw.strip().strip(';').split(';'):
            eq = line.find('=')
            if eq < 0: continue
            val = line[eq+1:].strip().strip('"').split('~')
            if len(val) >= 4 and val[3] not in ('', '0.000'):
                valid.add(val[2])
    except Exception as e:
        print(f'# 批次失败: {e}', file=sys.stderr)

    print(f'# 验证 {start+BATCH}/{len(funds)}  通过={len(valid)}', file=sys.stderr)

print(f'# Tencent验证通过: {len(valid)} 只', file=sys.stderr)

# 3. 生成拼音 + 输出
from pypinyin import lazy_pinyin, Style

output = []
for code, name in funds:
    if code not in valid:
        continue
    py = ''.join(lazy_pinyin(name, style=Style.FIRST_LETTER)).upper()
    output.append({"c": code, "n": name, "i": py})

print(json.dumps(output, ensure_ascii=False, separators=(',', ':')))
print(f'# 输出: {len(output)} 条', file=sys.stderr)