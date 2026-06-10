#!/usr/bin/env python3
"""
获取 A股 场内 ETF + LOF 基金代码列表（东方财富 API）
输出到 stdout，格式：代码\t名称
"""
import urllib.request
import json
import re
import gzip

def fetch_url(url):
    """Fetch URL with gzip support"""
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
    req.add_header('Accept', 'text/html,application/json,*/*')
    resp = urllib.request.urlopen(req, timeout=15)
    data = resp.read()
    if resp.headers.get('Content-Encoding') == 'gzip':
        data = gzip.decompress(data)
    return data.decode('utf-8', errors='replace')


# 东方财富场内基金列表 API（不分页获取全部）
# 参考 eastmoney API: https://fund.eastmoney.com/js/fundcode_search.js
# 这个文件包含所有基金（场内外），需要过滤

# 方法1: 先获取所有基金代码
funds_js = fetch_url('https://fund.eastmoney.com/js/fundcode_search.js')
# 格式: var r = [["000001","HXCZ","华夏成长",...], ...]
m = re.search(r'var r = (\[.*?\]);', funds_js)
if not m:
    print("ERROR: cannot parse fund list", file=__import__('sys').stderr)
    exit(1)

all_funds = json.loads(m.group(1))

# 东方财富 fund_type 判断：
# 需要通过 eastmoney API 判断哪些是场内 ETF/LOF
# 也可以直接用代码前缀判断：
# 159xxx, 16xxxx 在深交所，51xxxx, 56xxxx, 58xxxx 在上交所
# 但需要确认哪些确实是上市交易的

# 方法2: 直接用东方财富的场内交易基金列表API
# https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx?t=1&lx=1&letter=&gsid=&text=&sort=zdf,desc&page=1,5000&dt=...
# 但这个分页，先试一下

# 方法3: 使用东方财富的ETF和LOF实时行情API
# 先试试最简单的方法 — 从现有 API 获取 159/16/51/56/58 开头的所有基金

etf_lof = []
for f in all_funds:
    code = f[0]
    # 场内基金代码前缀
    if code.startswith(('159', '16', '51', '56', '58')):
        name = f[2]  # 基金名称
        # 移除基金名称中的特殊字符
        pinyin_initials = ''.join(
            w[0].upper() if w else '' 
            for w in re.sub(r'[^\u4e00-\u9fffA-Za-z0-9]', ' ', name).split()
        )
        # 拼音缩写可能不准确，先留空，用前4位字母
        etf_lof.append((code, name))

etf_lof.sort(key=lambda x: x[0])
for code, name in etf_lof:
    print(f'{code}\t{name}')

print(f'\n# Total: {len(etf_lof)} funds', file=__import__('sys').stderr)