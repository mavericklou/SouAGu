# 持仓助手平台版

基于现有Portfolio重构的多用户版本，用于老师展示持仓，学生围观打赏。

## 快速开始

### 1. 安装依赖

```bash
cd souagu-platform
npm install
```

### 2. 启动服务

```bash
npm start
```

服务将在 http://localhost:3000 启动

### 3. 注册账号

访问 http://localhost:3000/register 注册老师账号

### 4. 管理持仓

登录后访问 http://localhost:3000/dashboard 管理持仓

### 5. 分享主页

将 `http://localhost:3000/teacher/{你的ID}` 分享给学生

---

## 目录结构

```
souagu-platform/
├── server/              # 后端
│   ├── index.js         # Express入口
│   ├── routes/          # 路由
│   └── db/              # 数据库
├── public/              # 前端
│   ├── css/             # 样式
│   ├── js/              # 脚本
│   └── images/          # 图片
└── package.json
```

## 技术栈

- **前端**：原生HTML/CSS/JS
- **后端**：Node.js + Express
- **数据库**：SQLite
- **行情**：腾讯财经API

## 后续计划

- [ ] 收益曲线图表
- [ ] 订阅付费功能
- [ ] 企微群机器人通知
