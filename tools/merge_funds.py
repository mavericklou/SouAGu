#!/usr/bin/env python3
"""合并 A股 stocks.json + ETF/LOF 数据为统一数据文件
用法: merge_funds.py <stocks.json> <funds.json> <output_base>
生成: <output_base>.json 和 <output_base>-data.js
"""
import json, sys

stocks_path = sys.argv[1]
funds_path = sys.argv[2]
output_base = sys.argv[3]  # e.g. stocks-all

with open(stocks_path) as f:
    stocks = json.load(f)
with open(funds_path) as f:
    funds = json.load(f)

# 合并（按代码去重）
all_codes = {}
for s in stocks:
    all_codes[s['c']] = s
for f in funds:
    if f['c'] not in all_codes:
        all_codes[f['c']] = f

combined = sorted(all_codes.values(), key=lambda x: x['c'])
total = len(combined)
print(f'Stocks: {len(stocks)} + Funds: {len(funds)} = Combined: {total}', file=__import__('sys').stderr)

# stocks-all.json (HTTP 模式)
json_path = output_base + '.json'
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(combined, f, ensure_ascii=False, separators=(',', ':'))
print(f'JSON: {json_path} ({total}条)', file=__import__('sys').stderr)

# stocks-all-data.js (file:// 模式)
js_path = output_base + '-data.js'
with open(js_path, 'w', encoding='utf-8') as f:
    json_str = json.dumps(combined, ensure_ascii=False, separators=(',', ':'))
    f.write(f'// 股票+ETF+LOF数据 ({total}条)\n')
    f.write(f'window.__STOCKS_DATA = {json_str}\n')
print(f'JS:   {js_path} ({total}条)', file=__import__('sys').stderr)

# 统计保存到统计文件
stats_path = output_base + '_stats.txt'
prefixes = {}
for s in combined:
    p = s['c'][:2]
    prefixes[p] = prefixes.get(p, 0) + 1
with open(stats_path, 'w', encoding='utf-8') as f:
    f.write(f'合并后总条数: {total}\n\n')
    f.write('按代码前缀统计:\n')
    for k in sorted(prefixes):
        f.write(f'  {k}xxxx: {prefixes[k]}\n')
    f.write('\n')
    # 基金数量 = total - stock数量
    fund_types = {}
    for s in combined:
        c = s['c']
        if c.startswith(('159','16','51','56','58')):
            fund_types[c[:2]] = fund_types.get(c[:2], 0) + 1
    f.write('场内基金:\n')
    for k in sorted(fund_types):
        f.write(f'  {k}xxxx: {fund_types[k]}\n')
    f.write(f'  合计: {sum(fund_types.values())}\n')
print(f'Stats: {stats_path}', file=__import__('sys').stderr)