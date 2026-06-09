"""
全量扫描所有ETF代码
"""
import urllib.request
import json
import time
import sys

def batch_query(codes):
    if not codes:
        return {}
    chunk_size = 100
    results = {}
    for i in range(0, len(codes), chunk_size):
        chunk = codes[i:i+chunk_size]
        url = "http://qt.gtimg.cn/q=" + ",".join(chunk)
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0')
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode('gbk')
            for line in text.strip().split(';\n'):
                line = line.strip()
                if not line:
                    continue
                eq_pos = line.find('=')
                if eq_pos < 0:
                    continue
                var_name = line[:eq_pos].strip()
                value_part = line[eq_pos+1:].strip()
                if value_part.startswith('"') and value_part.endswith('"'):
                    value_part = value_part[1:-1]
                if 'pv_none_match' in var_name:
                    continue
                fields = value_part.split('~')
                if len(fields) < 2:
                    continue
                name = fields[1].strip()
                code = fields[2].strip() if len(fields) > 2 else ''
                if name and code:
                    results[code] = {'name': name}
        except Exception as e:
            print(f"  Error batch {i//chunk_size}: {e}", file=sys.stderr)
        time.sleep(0.05)
    return results

# ETF代码范围
ranges = []
# 上海: 510000-518999
for prefix in range(510, 519):
    ranges.append((prefix, 'sh'))
# 上海: 560000-563999
for prefix in range(560, 564):
    ranges.append((prefix, 'sh'))
# 上海: 588000-588999 (科创ETF)
ranges.append((588, 'sh'))
# 深圳: 159000-159999
ranges.append((159, 'sz'))

total_codes = sum(1000 for _ in ranges)
print(f"扫描 {len(ranges)} 个千位区间, 共 {total_codes} 个代码", file=sys.stderr)

all_etfs = {}
for prefix, market in ranges:
    codes = [f"{market}{prefix}{s:03d}" for s in range(0, 1000)]
    print(f"  {market}{prefix:03d}xxx (1000个)...", file=sys.stderr)
    results = batch_query(codes)
    all_etfs.update(results)
    valid = len(results)
    if valid > 0:
        names = [f"{k}={v['name']}" for k, v in sorted(results.items())[:3]]
        print(f"    -> {valid}只: {', '.join(names)}...", file=sys.stderr)
    else:
        print(f"    -> 0只", file=sys.stderr)

result_list = [{'c': code, 'n': info['name']} for code, info in sorted(all_etfs.items())]
print(f"\n共找到 {len(result_list)} 只ETF", file=sys.stderr)

# 写文件
output_path = '/Users/openclawbot/SouAGu/tools/etf_list.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result_list, f, ensure_ascii=False)
print(f"已保存到 {output_path}", file=sys.stderr)
print(json.dumps(result_list, ensure_ascii=False))