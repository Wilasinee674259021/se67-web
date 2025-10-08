const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'se67-secret', resave: false, saveUninitialized: false }));

const publicDir = path.join(__dirname, 'public');
const uploadDir = path.join(publicDir, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
app.use(express.static(publicDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Auth helpers
function requireLogin(req, res, next) {
  if (req.session.userId) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function requireAdmin(req, res, next) {
  if (req.session.userRole === 'admin') return next();
  res.status(403).json({ error: 'Forbidden' });
}

// Routes
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) return res.status(400).json({ error: 'email already used' });
  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  await db.run('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)', [id, name||'', email, hash, 'customer']);
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(400).json({ error: 'invalid credentials' });
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.userName = user.name;
  res.json({ ok: true, role: user.role, name: user.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, id: req.session.userId, role: req.session.userRole, name: req.session.userName });
});

// Products CRUD
app.get('/api/products', async (req, res) => {
  const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/products', requireLogin, requireAdmin, upload.single('image'), async (req, res) => {
  const { name, description, price } = req.body;
  const image = req.file ? `/uploads/${path.basename(req.file.path)}` : null;
  const id = uuidv4();
  await db.run('INSERT INTO products(id,name,description,price,image,created_at) VALUES(?,?,?,?,?,datetime("now"))', [id, name, description, price || 0, image]);
  res.json({ ok: true });
});

app.put('/api/products/:id', requireLogin, requireAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price } = req.body;
  let image = null;
  if (req.file) image = `/uploads/${path.basename(req.file.path)}`;
  const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return res.status(404).json({ error: 'not found' });
  const newImage = image || product.image;
  await db.run('UPDATE products SET name=?,description=?,price=?,image=? WHERE id=?', [name, description, price||0, newImage, id]);
  res.json({ ok: true });
});

app.delete('/api/products/:id', requireLogin, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
  if (!product) return res.status(404).json({ error: 'not found' });
  if (product.image) {
    const p = path.join(publicDir, product.image.replace(/^\//, ''));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  await db.run('DELETE FROM products WHERE id = ?', [id]);
  res.json({ ok: true });
});

// Checkout: create order and items
app.post('/api/checkout', requireLogin, async (req, res) => {
  const { items, payment_method } = req.body; // items: [{product_id, qty}]
  if (!Array.isArray(items) || items.length===0) return res.status(400).json({ error: 'no items' });
  // calculate total
  const ids = items.map(i=>i.product_id);
  const placeholders = ids.map(()=>'?').join(',');
  const products = await db.all(`SELECT id,price,name FROM products WHERE id IN (${placeholders})`, ids);
  const prodMap = Object.fromEntries(products.map(p=>[p.id,p]));
  let total = 0;
  const orderId = uuidv4();
  for (const it of items){
    const p = prodMap[it.product_id];
    if (!p) return res.status(400).json({ error: 'invalid product '+it.product_id });
    total += (Number(p.price)||0) * (Number(it.qty)||1);
  }
  await db.run('INSERT INTO orders(id,user_id,total,payment_method,paid_at,created_at) VALUES(?,?,?,?,datetime("now"),datetime("now"))', [orderId, req.session.userId, total, payment_method||'cash']);
  for (const it of items){
    const p = prodMap[it.product_id];
    await db.run('INSERT INTO order_items(order_id,product_id,qty,price) VALUES(?,?,?,?)', [orderId, p.id, it.qty||1, p.price]);
  }
  res.json({ ok: true, orderId });
});

app.get('/api/orders/:id', requireLogin, async (req, res) => {
  const { id } = req.params;
  const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (order.user_id !== req.session.userId && req.session.userRole !== 'admin') return res.status(403).json({ error: 'forbidden' });
  const items = await db.all('SELECT oi.*, p.name FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE order_id = ?', [id]);
  res.json({ order, items });
});

app.get('/api/my-orders', requireLogin, async (req, res) => {
  const orders = await db.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId]);
  res.json(orders);
});

// Fallback to index
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
