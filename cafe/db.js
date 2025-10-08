const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'data.sqlite');

async function init() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      price REAL,
      image TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      total REAL,
      payment_method TEXT,
      paid_at TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT,
      product_id TEXT,
      qty INTEGER,
      price REAL
    );
  `);

  // create default admin if not exists
  const admin = await db.get('SELECT * FROM users WHERE role = "admin" LIMIT 1');
  if (!admin) {
    const hash = await bcrypt.hash('admin123', 10);
    const id = 'admin-1';
    await db.run('INSERT OR IGNORE INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)', [id, 'Admin', 'admin@cafe.local', hash, 'admin']);
    console.log('Created default admin: admin@cafe.local / admin123');
  }

  return db;
}

let _dbPromise = init();

module.exports = {
  get: async (...args) => { const db = await _dbPromise; return db.get(...args); },
  all: async (...args) => { const db = await _dbPromise; return db.all(...args); },
  run: async (...args) => { const db = await _dbPromise; return db.run(...args); }
};
