const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { createTeacher, getTeacherByUsername } = require('../db/database');

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '请输入账号和密码' });
  }
  
  const teacher = getTeacherByUsername(username);
  if (!teacher) {
    return res.status(401).json({ error: '账号不存在' });
  }
  
  if (!bcrypt.compareSync(password, teacher.password)) {
    return res.status(401).json({ error: '密码错误' });
  }
  
  req.session.teacherId = teacher.id;
  req.session.username = teacher.username;
  
  res.json({
    id: teacher.id,
    username: teacher.username,
    nickname: teacher.nickname
  });
});

// 注册
router.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: '请输入账号和密码' });
  }
  
  if (username.length < 3) {
    return res.status(400).json({ error: '账号至少3个字符' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少6个字符' });
  }
  
  const existing = getTeacherByUsername(username);
  if (existing) {
    return res.status(400).json({ error: '账号已存在' });
  }
  
  try {
    const teacher = createTeacher(username, password, nickname);
    req.session.teacherId = teacher.id;
    req.session.username = teacher.username;
    
    res.json({
      id: teacher.id,
      username: teacher.username,
      nickname: teacher.nickname
    });
  } catch (err) {
    res.status(500).json({ error: '注册失败' });
  }
});

// 退出登录
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 获取当前登录用户
router.get('/me', (req, res) => {
  if (!req.session.teacherId) {
    return res.status(401).json({ error: '未登录' });
  }
  
  const { getTeacherById } = require('../db/database');
  const teacher = getTeacherById(req.session.teacherId);
  if (!teacher) {
    return res.status(401).json({ error: '用户不存在' });
  }
  
  res.json(teacher);
});

module.exports = router;
