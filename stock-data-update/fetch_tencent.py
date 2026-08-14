#!/usr/bin/env python3
"""
从腾讯API全量扫描A股+ETF/LOF代码，生成 {code: name} 映射。

扫描范围（千位前缀）：
  深圳A股: 000-003 (主板), 300-303 (创业板)
  上海A股: 600-605 (主板), 688 (科创板)
  北交所:   920 (bj前缀)
  上海基金: 510-518, 560-563, 588-589
  深圳基金: 159, 160-169

输出到 stdout: JSON dict {code: name}
"""
import urllib.request, json, sys, time

def batch_query(codes):
    """批量查询，返回 {code: {name, price, ts}}。无效代码自动被忽略。"""
    results = {}
    chunk_size = 100
    for i in range(0, len(codes), chunk_size):
        chunk = codes[i:i+chunk_size]
        url = "http://qt.gtimg.cn/q=" + ",".join(chunk)
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode('gbk')
            for line in text.strip().split(';'):
                line = line.strip()
                if not line:
                    continue
                eq = line.find('=')
                if eq < 0:
                    continue
                val = line[eq+1:].strip().strip('"').split('~')
                if len(val) < 3:
                    continue
                code = val[2]
                name = val[1]
                if code and name:
                    price = val[3] if len(val) > 3 else ''
                    ts = val[30] if len(val) > 30 else ''
                    results[code] = {'n': name, 'p': price, 't': ts}
        except Exception as e:
            print(f"  Error batch {i//chunk_size}: {e}", file=sys.stderr)
        time.sleep(0.05)
    return results

# 千位前缀 -> 市场前缀
PREFIX_RANGES = [
    # 深圳A股
    (0, 'sz'), (1, 'sz'), (2, 'sz'), (3, 'sz'),
    # 创业板
    (300, 'sz'), (301, 'sz'), (302, 'sz'), (303, 'sz'),
    # 上海主板
    (600, 'sh'), (601, 'sh'), (603, 'sh'), (605, 'sh'),
    # 科创板
    (688, 'sh'),
    # 北交所
    (920, 'bj'),
    # 上海ETF
    (510, 'sh'), (511, 'sh'), (512, 'sh'), (513, 'sh'),
    (515, 'sh'), (516, 'sh'), (517, 'sh'), (518, 'sh'),
    (560, 'sh'), (561, 'sh'), (562, 'sh'), (563, 'sh'),
    (588, 'sh'), (589, 'sh'),
    # 深圳ETF/LOF
    (159, 'sz'), (160, 'sz'), (161, 'sz'), (162, 'sz'),
    (163, 'sz'), (164, 'sz'), (165, 'sz'), (166, 'sz'),
    (167, 'sz'), (168, 'sz'), (169, 'sz'),
]

total = len(PREFIX_RANGES) * 1000
print(f"扫描 {len(PREFIX_RANGES)} 个千位区间, 共 {total} 个代码", file=sys.stderr)

all_stocks = {}
for prefix, market in PREFIX_RANGES:
    codes = [f"{market}{prefix:03d}{s:03d}" for s in range(0, 1000)]
    print(f"  {market}{prefix:03d}xxx...", file=sys.stderr)
    results = batch_query(codes)
    all_stocks.update(results)
    print(f"    -> {len(results)} 只", file=sys.stderr)

print(f"共 {len(all_stocks)} 只", file=sys.stderr)
print(json.dumps(all_stocks, ensure_ascii=False, separators=(',', ':')))
