const express = require('express');
const path = require('path');
const session = require('express-session');
const { getDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'souagu-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// 静态文件
app.use(express.static(path.join(__dirname, '../public')));

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/holdings'));
app.use('/api', require('./routes/settings'));

// 页面路由
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

app.get('/teacher/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/teacher.html'));
});

// 初始化数据库并启动服务器
async function start() {
  await getDb();
  console.log('数据库初始化完成');
  
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

start().catch(console.error);
