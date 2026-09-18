# 盈亏计算算法

## 单行模式（getFees）

每条记录模拟"如果现在平仓"的盈亏，同时计算双向手续费：

```javascript
function getFees(code, costVal, mv) {
  var absCost = Math.abs(costVal);
  var absMv = Math.abs(mv);
  var buyFee = max(absCost * rate, minFee);    // 买入手续费（基于成本绝对值）
  var sellFee = max(absMv * rate, minFee);      // 卖出手续费（基于市值绝对值）
  var stampDuty = absMv * 0.0005;               // 印花税（仅股票）
  return {
    costWithFees = costVal + buyFee,            // 含买入手续费的成本（保留符号）
    netVal = mv - sellFee - stampDuty,          // 扣除卖出费用后的市值
    pl = netVal - costWithFees                   // 盈亏
  };
}
```

- 费率计算使用绝对值，确保卖出记录（负数）也按实际金额计算手续费
- costWithFees 和 netVal 保留原始符号，保证盈亏方向正确
- 买入记录（qty > 0）：正向成本 + 买入手续费，卖出手续费从市值中扣除
- 卖出记录（qty < 0）：负向成本 + 买入手续费（正值），卖出手续费从负市值中扣除

## 合并模式

当前实现（v0.0.9+）：按净持仓方向拆分，与单行逻辑不一致。

- 净买入（totalQty ≥ 0）：costWithFees = totalCostVal + totalBuyFee，netVal = mv（无卖出费用）
- 净卖出（totalQty < 0）：costWithFees = totalCostVal，netVal = mv + sellFee + stampDuty（无买入手续费）

**注意**：合并模式与单行加总存在差异，因为单行每条都含双向费用，合并后只算单向。此为设计差异，暂未统一。

## 费率配置

- 默认：股票 1‱，最低5元；ETF 1‱，最低0.5元
- 印花税：股票 0.05%（卖出），ETF 免征
- 用户可在设置中调整
