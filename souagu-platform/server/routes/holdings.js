const express = require('express');
const router = express.Router();
const { getHoldings, addHolding, updateHolding, deleteHolding, deleteAllHoldings, getTeacherById } = require('../db/database');

// 验证登录中间件
function requireAuth(req, res, next) {
  if (!req.session.teacherId) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 获取老师的持仓（公开）
router.get('/teacher/:id/holdings', (req, res) => {
  const teacherId = req.params.id;
  const holdings = getHoldings(teacherId);
  const teacher = getTeacherById(teacherId);
  res.json({ teacher, holdings });
});

// 获取当前登录用户的持仓
router.get('/my/holdings', requireAuth, (req, res) => {
  const holdings = getHoldings(req.session.teacherId);
  res.json(holdings);
});

// 添加持仓
router.post('/my/holdings', requireAuth, (req, res) => {
  const { stock_code, stock_name, quantity, cost_price } = req.body;
  
  if (!stock_code || !stock_name || !quantity || !cost_price) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  
  try {
    const result = addHolding(req.session.teacherId, {
      stock_code, stock_name, quantity, cost_price
    });
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: '添加失败' });
  }
});

// 更新持仓
router.put('/my/holdings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { quantity, cost_price, stock_name } = req.body;
  
  try {
    updateHolding(id, req.session.teacherId, { quantity, cost_price, stock_name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

// 删除持仓
router.delete('/my/holdings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  
  try {
    deleteHolding(id, req.session.teacherId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

// 清空持仓
router.delete('/my/holdings', requireAuth, (req, res) => {
  try {
    deleteAllHoldings(req.session.teacherId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '清空失败' });
  }
});

// 导出持仓（用于分享）
router.get('/my/holdings/export', requireAuth, (req, res) => {
  const holdings = getHoldings(req.session.teacherId);
  res.json(holdings);
});

module.exports = router;
