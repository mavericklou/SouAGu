const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'souagu.db');

let db = null;

async function getDb() {
  if (!db) {
    const SQL = await initSqlJs();
    
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }
    
    initDb();
  }
  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function initDb() {
  db.run(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(100) NOT NULL,
      nickname VARCHAR(50),
      avatar VARCHAR(255),
      bio TEXT,
      tip_qr VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      stock_code VARCHAR(10) NOT NULL,
      stock_name VARCHAR(50) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      cost_price DECIMAL(10,3) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDb();
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function createTeacher(username, password, nickname) {
  const hashedPassword = bcrypt.hashSync(password, 10);
  run(
    'INSERT INTO teachers (username, password, nickname) VALUES (?, ?, ?)',
    [username, hashedPassword, nickname || username]
  );
  const teacher = queryOne('SELECT id, username, nickname FROM teachers WHERE username = ?', [username]);
  return teacher;
}

function getTeacherByUsername(username) {
  return queryOne('SELECT * FROM teachers WHERE username = ?', [username]);
}

function getTeacherById(id) {
  return queryOne('SELECT id, username, nickname, avatar, bio, tip_qr, created_at FROM teachers WHERE id = ?', [id]);
}

function updateTeacher(id, data) {
  const fields = [];
  const values = [];
  
  if (data.nickname !== undefined) { fields.push('nickname = ?'); values.push(data.nickname); }
  if (data.avatar !== undefined) { fields.push('avatar = ?'); values.push(data.avatar); }
  if (data.bio !== undefined) { fields.push('bio = ?'); values.push(data.bio); }
  if (data.tip_qr !== undefined) { fields.push('tip_qr = ?'); values.push(data.tip_qr); }
  
  if (fields.length === 0) return null;
  
  values.push(id);
  run(`UPDATE teachers SET ${fields.join(', ')} WHERE id = ?`, values);
}

function getHoldings(teacherId) {
  return queryAll('SELECT * FROM holdings WHERE teacher_id = ? ORDER BY created_at DESC', [teacherId]);
}

function addHolding(teacherId, data) {
  run(
    'INSERT INTO holdings (teacher_id, stock_code, stock_name, quantity, cost_price) VALUES (?, ?, ?, ?, ?)',
    [teacherId, data.stock_code, data.stock_name, data.quantity, data.cost_price]
  );
  const holding = queryOne('SELECT * FROM holdings WHERE teacher_id = ? ORDER BY id DESC LIMIT 1', [teacherId]);
  return holding;
}

function updateHolding(id, teacherId, data) {
  const fields = [];
  const values = [];
  
  if (data.quantity !== undefined) { fields.push('quantity = ?'); values.push(data.quantity); }
  if (data.cost_price !== undefined) { fields.push('cost_price = ?'); values.push(data.cost_price); }
  if (data.stock_name !== undefined) { fields.push('stock_name = ?'); values.push(data.stock_name); }
  
  if (fields.length === 0) return null;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id, teacherId);
  
  run(`UPDATE holdings SET ${fields.join(', ')} WHERE id = ? AND teacher_id = ?`, values);
}

function deleteHolding(id, teacherId) {
  run('DELETE FROM holdings WHERE id = ? AND teacher_id = ?', [id, teacherId]);
}

function deleteAllHoldings(teacherId) {
  run('DELETE FROM holdings WHERE teacher_id = ?', [teacherId]);
}

module.exports = {
  getDb,
  createTeacher,
  getTeacherByUsername,
  getTeacherById,
  updateTeacher,
  getHoldings,
  addHolding,
  updateHolding,
  deleteHolding,
  deleteAllHoldings
};
