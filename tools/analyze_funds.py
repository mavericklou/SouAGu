#!/usr/bin/env python3
"""分析 ETF/LOF 数据"""
import json, sys
from collections import Counter

# 读ETF数据
with open(sys.argv[1]) as f:
    funds = json.load(f)

prefix = Counter(d['c'][:2] for d in funds)
print('按前缀统计:')
for k in sorted(prefix):
    print(f'  {k}xxxx: {prefix[k]}')
print(f'\n合计: {len(funds)} 只')

# 读现有 stocks.json
with open(sys.argv[2]) as f:
    stocks = json.load(f)
print(f'\n现有 stocks.json: {len(stocks)} 只')

existing_codes = set(s['c'] for s in stocks)
fund_codes = set(d['c'] for d in funds)
overlap = existing_codes & fund_codes
print(f'重叠（已存在）: {len(overlap)} 只')
if overlap:
    print('重叠代码:', sorted(overlap)[:10], '...')