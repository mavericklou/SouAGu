const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { updateTeacher, getTeacherById } = require('../db/database');

// 验证登录中间件
function requireAuth(req, res, next) {
  if (!req.session.teacherId) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../public/images'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `qr_${req.session.teacherId}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// 获取当前用户设置
router.get('/my/settings', requireAuth, (req, res) => {
  const teacher = getTeacherById(req.session.teacherId);
  res.json(teacher);
});

// 更新个人信息
router.put('/my/profile', requireAuth, (req, res) => {
  const { nickname, bio } = req.body;
  
  try {
    updateTeacher(req.session.teacherId, { nickname, bio });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

// 上传打赏二维码
router.post('/my/tip-qr', requireAuth, upload.single('qrcode'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '请选择图片' });
  }
  
  const qrUrl = `/images/${req.file.filename}`;
  
  try {
    updateTeacher(req.session.teacherId, { tip_qr: qrUrl });
    res.json({ url: qrUrl });
  } catch (err) {
    res.status(500).json({ error: '上传失败' });
  }
});

module.exports = router;
