#!/usr/bin/env python3
"""调试腾讯API批量查询，检查为什么只有2个通过"""
import urllib.request, urllib.parse, json

# 取前10个场内基金测试
test_funds = [
    ('159001', '货币ETF易方达'),
    ('159003', '招商快线ETF'),
    ('159005', '快钱ETF汇添富'),
    ('159007', '华泰柏瑞中证畜牧养殖产业ETF'),
    ('159008', '景顺长城中证全指证券公司ETF'),
    ('159009', '易方达创业板新能源ETF'),
    ('159010', '港股通科技ETF博时'),
    ('159011', '养殖ETF华安'),
    ('159012', '鹏华科创创业50ETF'),
    ('159013', '大成中证工业互联网主题ETF'),
]

codes_only = [c for c, _ in test_funds]
params = ['sz' + c for c in codes_only]
url = f'http://qt.gtimg.cn/q={",".join(params)}'
print(f'URL: {url}', file=__import__('sys').stderr)
print(f'URL length: {len(url)}', file=__import__('sys').stderr)

req = urllib.request.Request(url)
req.add_header('User-Agent', 'Mozilla/5.0')
resp = urllib.request.urlopen(req, timeout=10)
raw = resp.read().decode('gbk', errors='replace')

print(f'Response length: {len(raw)}', file=__import__('sys').stderr)

for line in raw.strip().split(';'):
    line = line.strip()
    if not line: continue
    eq = line.find('=')
    if eq < 0:
        print(f'NO EQ: {line[:100]}', file=__import__('sys').stderr)
        continue
    var_name = line[:eq].strip()
    val_str = line[eq+1:].strip().strip('"')
    if not val_str:
        print(f'EMPTY: {var_name}', file=__import__('sys').stderr)
        continue
    parts = val_str.split('~')
    code = parts[2] if len(parts) > 2 else '?'
    name = parts[1] if len(parts) > 1 else '?'
    price = parts[3] if len(parts) > 3 else '?'
    print(f'{var_name}: code={code} name={name} price={price} parts={len(parts)}', file=__import__('sys').stderr)