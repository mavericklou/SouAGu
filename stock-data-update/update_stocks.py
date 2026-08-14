#!/usr/bin/env python3
"""
SouAGu 股票数据更新主脚本（数据源：腾讯 qt.gtimg.cn）

流程：
1. 读取腾讯全量扫描结果 tencent_raw.json（由 fetch_tencent.py 生成）
2. 读取旧数据 stocks-data.js（作为合并基础）
3. 更新规则：
   - 旧数据已有 + 腾讯存在：
       * 腾讯名称以 XD/XR/DR 开头（分红除权除息临时名）→ 保留旧名称
       * 否则 → 用腾讯名称更新（基金直接换为腾讯简称）
   - 旧数据已有 + 腾讯不存在 → 保留旧记录
   - 腾讯新增（旧数据没有）：
       * 时间戳为当天实时（活股）→ 加入，名称规范化（去 C/N 前缀、-U 后缀）
       * 否则（退市/历史代码）→ 不加入
4. 生成拼音首字母（pypinyin，去空格）
5. 输出 stocks-data.js、stocks.json 及差异报告
"""
import json, re, sys, os
from pypinyin import lazy_pinyin, Style

BASE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(BASE, 'tmp')

def load_tencent(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def load_old_data(path):
    with open(path, encoding='utf-8') as f:
        content = f.read()
    start = content.find('[')
    end = content.rfind(']')
    return json.loads(content[start:end+1])

def compress_spaces(name):
    """将连续空格压缩为单个空格（腾讯返回的名称常带对齐空格）"""
    return re.sub(r'\s+', ' ', name).strip()

def normalize_name(name):
    """规范化名称：压缩空格；新增股去除 C/N 前缀与 -U 后缀"""
    name = compress_spaces(name)
    # 去除上市初期 C/N 前缀（如 "C超纯应材" -> "超纯应材"）
    if len(name) > 1 and name[0] in ('C', 'N') and name[1] != ' ':
        name = name[1:]
    # 去除科创板 -U 后缀（如 "泰诺麦博-U" -> "泰诺麦博"）
    if name.endswith('-U'):
        name = name[:-2]
    # 去除科创板 -W 后缀（同股不同权标记，如 "优刻得-W" -> "优刻得"）
    if name.endswith('-W'):
        name = name[:-2]
    return compress_spaces(name)

def pinyin_initials(name):
    """生成拼音首字母，去空格（与旧数据格式一致）"""
    # 处理 *ST 前缀：pypinyin 会把 *ST 作为整体返回，需先去掉 *
    clean = name.replace('*', '')
    initials = lazy_pinyin(clean, style=Style.FIRST_LETTER)
    return ''.join(i.upper() for i in initials if i and i != ' ')

# 人工修正表：腾讯 API 对名称字段有 10 字节(GBK)限制，
# 超限名称会被截断（如 688828 "国仪公司" -> "C国仪-U"）。
# 此处以交易所/发行公告的完整简称修正（数据源非腾讯 API，为人工核实）。
MANUAL_FIX = {
    '688828': '国仪公司',
}

def apply_manual_fix(code, name):
    """对规范化后的名称应用人工修正（如需）"""
    return MANUAL_FIX.get(code, name)

def load_st_orig_names():
    """加载 ST 股原名称（戴帽前简称）映射表 {code: 原名称}。
    数据来源为 web 搜索核实的公司更名公告（非腾讯 API）。"""
    path = os.path.join(BASE, 'st_orig_names.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return {}

def is_live(ts):
    """判断时间戳是否为当天实时交易（活股）。退市/历史股为 09:00/09:10 固定值"""
    if not ts or len(ts) < 12:
        return False
    return ts.startswith('20260814') and ts[8:12] > '0930'

def main():
    tencent = load_tencent(os.path.join(TMP, 'tencent_raw.json'))
    old = load_old_data(os.path.join(BASE, '..', 'stocks-data.js'))
    old_map = {x['c']: x for x in old}

    # 腾讯名称以 XD/XR/DR 开头（分红除权除息临时标记）
    def is_dividend_name(n):
        return n.startswith(('XD', 'XR', 'DR'))

    updated = {}      # c -> record
    stats = {'updated_name': 0, 'kept_dividend': 0, 'added': 0, 'skipped_retired': 0, 'fund_renamed': 0}

    # ---- 处理旧数据已有代码 ----
    for c, rec in old_map.items():
        if c in tencent:
            tname = tencent[c]['n']
            if is_dividend_name(tname):
                # 分红除息临时名，保留旧名称
                updated[c] = dict(rec)
                stats['kept_dividend'] += 1
            else:
                new_name = normalize_name(tname)
                if new_name != rec['n']:
                    if c.startswith(('15', '16', '51', '56', '58')):
                        stats['fund_renamed'] += 1
                    else:
                        stats['updated_name'] += 1
                    updated[c] = {'c': c, 'n': new_name}
                else:
                    # 名称未变，保留旧拼音（多音字处理与旧数据一致）
                    updated[c] = dict(rec)
        else:
            # 腾讯扫描不到（不应出现），保留旧记录
            updated[c] = dict(rec)

    # ---- 处理腾讯新增（旧数据没有的代码）----
    added_detail = []
    for c in tencent:
        if c in old_map:
            continue
        v = tencent[c]
        if not is_live(v['t']):
            stats['skipped_retired'] += 1
            continue
        new_name = normalize_name(v['n'])
        if not new_name:
            continue
        new_name = apply_manual_fix(c, new_name)
        updated[c] = {'c': c, 'n': new_name}
        added_detail.append((c, v['n'], new_name))
        stats['added'] += 1

    # ---- 生成拼音首字母 + 排序 ----
    # 新增的记录（无 i 字段）或名称变化的记录需要重新生成拼音；
    # 名称未变的旧记录保留原 i（多音字与旧数据一致）
    st_orig = load_st_orig_names()
    st_orig_added = 0
    result = []
    for c, rec in updated.items():
        rec = dict(rec)
        if 'i' not in rec:
            rec['i'] = pinyin_initials(rec['n'])
        # ST 股：在原拼音后追加原名称（戴帽前简称）拼音，逗号分隔。
        # 逗号前为主拼音（ST 名，兼容旧代码前缀匹配），逗号后为原名称拼音。
        if c in st_orig:
            orig_py = pinyin_initials(st_orig[c])
            if orig_py and orig_py != rec['i']:
                rec['i'] = rec['i'] + ',' + orig_py
                st_orig_added += 1
        result.append(rec)
    result.sort(key=lambda x: x['c'])

    total = len(result)
    print(f"总条数: {total}", file=sys.stderr)
    print(f"  更新名称: {stats['updated_name']}", file=sys.stderr)
    print(f"  分红保留旧名: {stats['kept_dividend']}", file=sys.stderr)
    print(f"  基金换腾讯简称: {stats['fund_renamed']}", file=sys.stderr)
    print(f"  新增活股: {stats['added']}", file=sys.stderr)
    print(f"  跳过退市/历史: {stats['skipped_retired']}", file=sys.stderr)
    print(f"  ST股附加原名称拼音: {st_orig_added}", file=sys.stderr)

    # ---- 输出 stocks-data.js ----
    js_content = f"// 股票+ETF+LOF数据 ({total}条)\nwindow.__STOCKS_DATA = {json.dumps(result, ensure_ascii=False, separators=(',', ':'))};\n"
    js_path = os.path.join(BASE, 'stocks-data.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"已输出: {js_path}", file=sys.stderr)

    # ---- 输出 stocks.json ----
    json_path = os.path.join(BASE, 'stocks.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    print(f"已输出: {json_path}", file=sys.stderr)

    # ---- 输出差异报告 ----
    report = []
    report.append(f"更新日期: 2026-08-14")
    report.append(f"数据源: 腾讯 qt.gtimg.cn 全量扫描")
    report.append(f"")
    report.append(f"== 汇总 ==")
    report.append(f"总条数: {total} (旧数据 {len(old)})")
    report.append(f"更新名称: {stats['updated_name']}")
    report.append(f"分红除息保留旧名: {stats['kept_dividend']}")
    report.append(f"基金换为腾讯简称: {stats['fund_renamed']}")
    report.append(f"新增活股: {stats['added']}")
    report.append(f"跳过退市/历史代码: {stats['skipped_retired']}")
    report.append(f"")
    report.append(f"== 新增股票(腾讯实时确认) ==")
    for c, orig, new in sorted(added_detail):
        report.append(f"  {c} {orig} -> {new}")

    # 退市股（旧数据存在、腾讯返回 XX退）
    report.append(f"")
    report.append(f"== 已退市股票（名称更新为退市名）==")
    for c, rec in old_map.items():
        if c in tencent and tencent[c]['n'].endswith('退'):
            report.append(f"  {c} {rec['n']} -> {tencent[c]['n']}")

    # 人工修正（腾讯 10 字节限制导致的截断名）
    if MANUAL_FIX:
        report.append(f"")
        report.append(f"== 人工修正（腾讯名称超长被截断，以发行公告简称修正）==")
        for c, full in sorted(MANUAL_FIX.items()):
            report.append(f"  {c} {tencent.get(c, {}).get('n', '?')} -> {full}")

    report_path = os.path.join(BASE, 'UPDATE_REPORT.txt')
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))
    print(f"已输出: {report_path}", file=sys.stderr)

if __name__ == '__main__':
    main()
