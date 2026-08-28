# 持仓助手 MVP 设计文档（V1.0）

## 一、产品定位

**老师的"战绩名片"**

帮老师展示真实持仓，建立信任，获得打赏。

---

## 二、核心思路

**复用现有Portfolio页面**，增加：
- 多用户系统（每个老师一个独立页面）
- 数据存储到服务器
- 打赏二维码展示

---

## 三、已完成内容

### 3.1 目录结构

```
souagu-platform/
├── server/
│   ├── index.js           # Express入口（初始化数据库+启动服务）
│   ├── routes/
│   │   ├── auth.js        # 登录/注册/退出/获取当前用户
│   │   ├── holdings.js    # 持仓CRUD（增删改查）
│   │   └── settings.js    # 打赏二维码上传
│   └── db/
│       └── database.js    # SQLite数据库（sql.js）
├── public/
│   ├── css/
│   │   ├── common.css     # 公共样式（按钮、输入框）
│   │   ├── auth.css       # 登录/注册页样式
│   │   └── dashboard.css  # 后台管理样式
│   ├── js/
│   │   └── common.js      # API封装、工具函数
│   ├── login.html         # 登录页
│   ├── register.html      # 注册页
│   ├── dashboard.html     # 老师后台（持仓管理）
│   └── teacher.html       # 公开主页（学生查看）
├── package.json
└── README.md
```

### 3.2 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端 | 原生HTML/CSS/JS | 手机H5，无框架 |
| 后端 | Node.js + Express | 轻量级 |
| 数据库 | SQLite（sql.js） | 纯JS实现，无需编译 |
| 认证 | express-session | Cookie session |
| 密码 | bcryptjs | 加密存储 |
| 文件上传 | multer | 打赏二维码图片 |
| 行情 | 腾讯财经API | 实时股票行情 |

### 3.3 已实现功能

#### 登录/注册
- 账号密码登录（零成本）
- 注册即登录
- Session保持7天

#### 老师后台
- 持仓增删改查
- 分享链接生成+复制
- 打赏二维码上传

#### 公开主页
- 实时行情显示（30秒刷新）
- 总市值/总盈亏/收益率
- 持仓列表
- 打赏二维码展示

### 3.4 数据库表

```sql
-- 老师表
teachers (
  id, username, password, nickname, 
  avatar, bio, tip_qr, created_at
)

-- 持仓表
holdings (
  id, teacher_id, stock_code, stock_name,
  quantity, cost_price, created_at, updated_at
)
```

### 3.5 页面设计

- **H5手机优先** — 所有页面针对移动端优化
- **禁止缩放** — viewport设置maximum-scale=1.0
- **触摸友好** — 按钮最小44px，输入框16px

---

## 四、待完成内容

### 4.1 高优先级（P0）

- [ ] 测试所有页面功能
- [ ] 修复可能的bug
- [ ] 部署上线

### 4.2 中优先级（P1）

- [ ] 收益曲线图表
- [ ] 关注/取关老师
- [ ] 老师列表页（首页）

### 4.3 低优先级（P2）

- [ ] 订阅付费功能
- [ ] 企微群机器人通知
- [ ] 数据导出

---

## 五、启动方式

```bash
cd souagu-platform
npm install
npm start
```

访问 http://localhost:3000/register 注册账号

---

## 六、环境问题记录

### Node.js动态库问题
- **问题**：`libllhttp.9.3.dylib` 找不到，系统是9.4.3版本
- **解决**：创建符号链接 `ln -sf libllhttp.9.4.3.dylib libllhttp.9.3.dylib`

### better-sqlite3编译失败
- **问题**：Node.js 25需要C++20，编译器不支持
- **解决**：换用`sql.js`（纯JS实现的SQLite）

---

*文档版本：V1.0*
*更新时间：2026-08-27*
*状态：基础功能已完成，待测试部署*
