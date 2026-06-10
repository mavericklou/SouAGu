#!/usr/bin/env python3
"""
生成 SouAGu 项目所需的 ETF + LOF 基金数据
数据源: 东方财富 fundcode_search.js（静态CDN文件）
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

print('# 下载基金列表...', file=__import__('sys').stderr)
js = fetch('https://fund.eastmoney.com/js/fundcode_search.js')
m = re.search(r'var r = (\[.*?\])\s*;', js, re.DOTALL)
all_funds = json.loads(m.group(1))

# 场内可交易基金代码前缀
EXCHANGE_PREFIXES = ('159', '16', '51', '56', '58')
# 排除非交易品种
NON_TRADABLE = {
    '易方达保证金货币B', '招商保证金快线B', '汇添富收益快钱货币B',
    '南方理财金H', '华宝添益B', '银华日利B', '建信添益B',
    '交易货币B', '理财金H',
}

# 筛选 + 排序
funds = [(f[0], f[2]) for f in all_funds
         if f[0].startswith(EXCHANGE_PREFIXES) and f[2] not in NON_TRADABLE]
funds.sort(key=lambda x: x[0])
print(f'# 筛选出 {len(funds)} 只场内基金', file=__import__('sys').stderr)

print('# 生成拼音首字母...', file=__import__('sys').stderr)
from pypinyin import lazy_pinyin, Style

output = []
for code, name in funds:
    py = ''.join(lazy_pinyin(name, style=Style.FIRST_LETTER)).upper()
    output.append({"c": code, "n": name, "i": py})

print(json.dumps(output, ensure_ascii=False, separators=(',', ':')))
print(f'# 完成: {len(output)} 条', file=__import__('sys').stderr)
