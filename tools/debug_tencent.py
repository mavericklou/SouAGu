#!/usr/bin/env python3
"""检查腾讯API对ETF/LOF的返回格式"""
import urllib.request

# 测试几个已知的ETF和LOF
test_codes = ['sh159915', 'sz159915', 'sh510050', 'sz159928', 'sz161725', 'sh588000']
url = f'http://qt.gtimg.cn/q={",".join(test_codes)}'
req = urllib.request.Request(url)
req.add_header('User-Agent', 'Mozilla/5.0')
resp = urllib.request.urlopen(req, timeout=10)
raw = resp.read().decode('gbk', errors='replace')

for line in raw.strip().split(';'):
    line = line.strip()
    if not line: continue
    eq = line.find('=')
    val = line[eq+1:].strip().strip('"').split('~')
    print(f'Fields: {len(val)}')
    for i, v in enumerate(val):
        print(f'  [{i}] = {v}')
    print()