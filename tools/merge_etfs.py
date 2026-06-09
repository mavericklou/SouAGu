"""将 ETF 数据集成到 SouAGu 搜索组件，生成拼音首字母并合并到 stocks-data.js"""
import json
import sys
import os

# 激活新建的 venv，安装 pypinyin
os.system('cd /Users/openclawbot/SouAGu && uv pip install pypinyin -q 2>/dev/null')

try:
    from pypinyin import lazy_pinyin, Style
    HAVE_PYPINYIN = True
except ImportError:
    HAVE_PYPINYIN = False

def pinyin_initials_pypinyin(name):
    """用 pypinyin 生成拼音首字母"""
    initials = lazy_pinyin(name, style=Style.FIRST_LETTER)
    return ''.join(i.upper() if i else '*' for i in initials)

# 备用方案: 紧凑的汉字->拼音首字母映射 (覆盖368个ETF名称汉字)
CHAR_MAP = {
    '一':'Y','万':'W','三':'S','上':'S','专':'Z','业':'Y','东':'D','中':'Z','主':'Z','之':'Z','事':'S','云':'Y',
    '互':'H','亚':'Y','交':'J','产':'C','京':'J','亮':'L','人':'R','件':'J','价':'J','任':'R','企':'Q','伏':'F',
    '优':'Y','传':'C','低':'D','体':'T','保':'B','信':'X','债':'Z','值':'Z','健':'J','储':'C','元':'Y','先':'X',
    '光':'G','克':'K','全':'Q','公':'G','共':'G','关':'G','兴':'X','养':'Y','冀':'J','军':'J','农':'N','凤':'F',
    '凰':'H','分':'F','创':'C','利':'L','制':'Z','券':'Q','前':'Q','力':'L','加':'J','务':'W','动':'D','化':'H',
    '北':'B','区':'Q','医':'Y','十':'S','升':'S','半':'B','华':'H','南':'N','博':'B','卫':'W','原':'Y','双':'S',
    '发':'F','可':'K','司':'S','合':'H','周':'Z','和':'H','品':'P','商':'S','嘉':'J','器':'Q','四':'S','国':'G',
    '回':'H','园':'Y','圈':'Q','土':'T','在':'Z','地':'D','城':'C','基':'J','塔':'T','增':'Z','备':'B','夏':'X',
    '大':'D','天':'T','太':'T','央':'Y','头':'T','媒':'M','子':'Z','字':'Z','安':'A','宗':'Z','宝':'B','实':'S',
    '家':'J','富':'F','导':'D','寿':'S','小':'X','居':'J','展':'Z','属':'S','山':'S','川':'C','州':'Z','工':'G',
    '巴':'B','币':'B','市':'S','带':'D','平':'P','年':'N','广':'G','床':'C','康':'K','建':'J','开':'K','弘':'H',
    '张':'Z','强':'Q','影':'Y','得':'D','德':'D','心':'X','快':'K','恒':'H','息':'X','戏':'X','成':'C','战':'Z',
    '房':'F','扬':'Y','技':'J','投':'T','护':'H','报':'B','招':'Z','持':'C','指':'Z','据':'J','摩':'M','收':'S',
    '改':'G','政':'Z','教':'J','数':'S','整':'Z','料':'L','斯':'S','新':'X','方':'F','旅':'L','日':'R','时':'S',
    '易':'Y','星':'X','普':'P','景':'J','智':'Z','有':'Y','服':'F','期':'Q','术':'S','本':'B','机':'J','权':'Q',
    '材':'C','村':'C','杭':'H','板':'B','构':'G','柏':'B','标':'B','核':'H','根':'G','械':'X','概':'G','正':'Z',
    '殖':'Z','毅':'Y','母':'M','民':'M','气':'Q','永':'Y','汇':'H','江':'J','池':'C','汽':'Q','沙':'S','沪':'H',
    '河':'H','油':'Y','治':'Z','法':'F','波':'B','泰':'T','津':'J','流':'L','济':'J','浙':'Z','浦':'P','海':'H',
    '消':'X','深':'S','添':'T','渔':'Y','渝':'Y','港':'G','游':'Y','湖':'H','湾':'W','源':'Y','漂':'P','澳':'A',
    '炭':'T','煤':'M','片':'P','牌':'P','牧':'M','物':'W','特':'T','环':'H','现':'X','理':'L','琼':'Q','瑞':'R',
    '用':'Y','生':'S','由':'Y','申':'S','电':'D','畜':'X','略':'L','疗':'L','疫':'Y','百':'B','益':'Y','盘':'P',
    '盛':'S','短':'D','石':'S','矿':'K','碳':'T','福':'F','科':'K','稀':'X','程':'C','空':'K','端':'D','算':'S',
    '等':'D','管':'G','粕':'P','粤':'Y','粮':'L','精':'J','红':'H','级':'J','纳':'N','线':'X','细':'X','经':'J',
    '结':'J','续':'X','综':'Z','绿':'L','网':'W','美':'M','老':'L','联':'L','股':'G','育':'Y','能':'N','自':'Z',
    '航':'H','舶':'B','船':'C','色':'S','芯':'X','苗':'M','药':'Y','菱':'L','营':'Y','融':'R','行':'H','装':'Z',
    '西':'X','要':'Y','视':'S','角':'J','计':'J','设':'S','证':'Z','诺':'N','调':'D','豆':'D','贝':'B','财':'C',
    '责':'Z','货':'H','质':'Z','购':'G','费':'F','资':'Z','赢':'Y','超':'C','路':'L','车':'C','转':'Z','软':'R',
    '输':'S','达':'D','运':'Y','进':'J','远':'Y','选':'X','通':'T','造':'Z','道':'D','邦':'B','部':'B','配':'P',
    '酒':'J','重':'Z','量':'L','金':'J','鑫':'X','钢':'G','钱':'Q','铁':'T','银':'Y','锂':'L','锋':'F','长':'C',
    '防':'F','险':'X','集':'J','零':'L','非':'F','面':'M','革':'G','韩':'H','顺':'S','领':'L','题':'T','食':'S',
    '饮':'Y','香':'X','驶':'S','驾':'J','高':'G','鹏':'P','鹰':'Y','黄':'H','龙':'L',
}

def pinyin_initials_map(name):
    """用字符映射表生成拼音首字母"""
    result = []
    for ch in name:
        if 'A' <= ch <= 'Z' or 'a' <= ch <= 'z':
            result.append(ch.upper())
        elif '0' <= ch <= '9':
            result.append(ch)
        elif ch in CHAR_MAP:
            result.append(CHAR_MAP[ch])
        else:
            result.append('?')
    return ''.join(result)

def main():
    # 读取ETF列表
    with open('/Users/openclawbot/SouAGu/tools/etf_list.json', 'r', encoding='utf-8') as f:
        etfs = json.load(f)
    
    print(f"读取 {len(etfs)} 只ETF数据")
    
    if HAVE_PYPINYIN:
        print("使用 pypinyin 生成拼音首字母")
        gen_fn = pinyin_initials_pypinyin
    else:
        print("使用内置映射表生成拼音首字母")
        gen_fn = pinyin_initials_map
    
    # 生成拼音首字母
    for etf in etfs:
        etf['i'] = gen_fn(etf['n'])
    
    # 按代码排序
    etfs.sort(key=lambda x: x['c'])
    
    # 输出统计
    ok = sum(1 for e in etfs if '?' not in e['i'])
    print(f"拼音首字母生成: {ok}/{len(etfs)} 成功")
    
    # 读入 stocks-data.js 并合并
    stocks_path = '/Users/openclawbot/SouAGu/stocks-data.js'
    with open(stocks_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 解析已有的JS数组
    start = content.find('[')
    end = content.rfind(']')
    if start == -1 or end == -1:
        print("Error: 无法解析 stocks-data.js", file=sys.stderr)
        sys.exit(1)
    
    existing_stocks = json.loads(content[start:end+1])
    print(f"现有A股: {len(existing_stocks)} 只")
    
    # 合并 (ETF代码不会和A股冲突)
    all_data = existing_stocks + etfs
    print(f"合并后总数: {len(all_data)} 条")
    
    # 写入新的 stocks-data.js
    new_js = f"// 股票+ETF数据 ({len(all_data)}条)\nwindow.__STOCKS_DATA = {json.dumps(all_data, ensure_ascii=False)};\n"
    
    with open(stocks_path, 'w', encoding='utf-8') as f:
        f.write(new_js)
    
    print(f"\n已更新 {stocks_path}")
    print(f"  - A股: {len(existing_stocks)} 只")
    print(f"  - ETF: {len(etfs)} 只")
    print(f"  - 合计: {len(all_data)} 条")
    
    # 验证
    stocks_end = len(existing_stocks)
    print(f"\n验证 - ETF范围:")
    for i in range(0, min(10, len(etfs))):
        e = etfs[i]
        print(f"  {e['c']} {e['n']} [{e['i']}]")
    for i in range(max(0, len(etfs)-3), len(etfs)):
        e = etfs[i]
        print(f"  {e['c']} {e['n']} [{e['i']}]")

if __name__ == '__main__':
    main()