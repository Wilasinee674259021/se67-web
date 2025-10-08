// Simple client for Pink Cafe
async function api(path, opts={}){
  const res = await fetch('/api'+path, opts);
  if (!res.ok) throw await res.json();
  return res.json();
}

// Helpers
function el(q, root=document){ return root.querySelector(q); }
function create(tag, cls){ const e=document.createElement(tag); if(cls)e.className=cls; return e; }

// Render products for customers
async function loadProducts(){
  const list = el('#products');
  if (!list) return;
  list.innerHTML = '';
  const products = await api('/products');
  products.forEach(p=>{
    const card = create('div','product');
    const img = create('img'); img.src = p.image || '/placeholder.png';
    const h = create('h3'); h.textContent = p.name;
    const d = create('p'); d.textContent = p.description || '';
    const price = create('div'); price.textContent = '฿' + (Number(p.price)||0).toFixed(2);
    const add = create('button'); add.textContent='เพิ่มลงตะกร้า';
    add.onclick = ()=>{ addToCart(p.id, p.name, Number(p.price)||0); };
    card.appendChild(img); card.appendChild(h); card.appendChild(d); card.appendChild(price); card.appendChild(add);
    list.appendChild(card);
  });
}

// Cart helpers
function getCart(){ try{ return JSON.parse(localStorage.getItem('cart')||'[]'); }catch(e){ return []; } }
function saveCart(c){ localStorage.setItem('cart', JSON.stringify(c)); updateCartCount(); }
function updateCartCount(){ const c=getCart().reduce((s,i)=>s+i.qty,0); const elc=el('#cartCount'); if(elc) elc.textContent=c; }
function addToCart(product_id, name, price){ const cart=getCart(); const it=cart.find(i=>i.product_id===product_id); if(it){ it.qty+=1; } else { cart.push({product_id, name, price, qty:1}); } saveCart(cart); alert('เพิ่มแล้ว'); }

// Checkout page rendering
async function renderCheckout(){
  const items = getCart();
  const container = el('#cartItems'); if(!container) return;
  container.innerHTML='';
  let total=0;
  items.forEach(it=>{
    const row = create('div','card');
    row.innerHTML = `<strong>${it.name}</strong> <div>฿${(it.price||0).toFixed(2)} x ${it.qty} = ฿${(it.price*it.qty).toFixed(2)}</div>`;
    const dec = create('button'); dec.textContent='-'; dec.onclick=()=>{ it.qty=Math.max(0,it.qty-1); if(it.qty===0) { const idx=getCart().findIndex(x=>x.product_id===it.product_id); const c=getCart(); c.splice(idx,1); saveCart(c);} saveCart(getCart()); renderCheckout(); };
    const inc = create('button'); inc.textContent='+'; inc.onclick=()=>{ it.qty+=1; saveCart(getCart()); renderCheckout(); };
    row.appendChild(dec); row.appendChild(inc);
    container.appendChild(row);
    total += it.price * it.qty;
  });
  el('#cartTotal').textContent = (total).toFixed(2);
  el('#checkoutBtn').onclick = async ()=>{
    const payment = el('#paymentMethod').value;
    if (items.length===0) return alert('ตะกร้าว่าง');
    const payload = { items: items.map(i=>({ product_id: i.product_id, qty: i.qty })), payment_method: payment };
    try{
      const res = await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      const data = await res.json();
      if (!res.ok) throw data;
      localStorage.removeItem('cart');
      location.href = '/receipt.html?orderId='+data.orderId;
    }catch(err){ alert(err.error||'checkout error'); }
  };
}

// Receipt page
async function renderReceipt(){
  const qp = new URLSearchParams(location.search);
  const orderId = qp.get('orderId');
  if (!orderId) return;
  try{
    const data = await api('/orders/'+orderId);
    const r = el('#receipt');
    r.innerHTML = '';
    const h = create('div'); h.innerHTML = `<strong>Order: ${data.order.id}</strong><div>รวม: ฿${(data.order.total||0).toFixed(2)}</div><div>ชำระ: ${data.order.payment_method}</div><div>วันที่: ${data.order.created_at}</div>`;
    const list = create('div'); data.items.forEach(i=>{ const row=create('div','card'); row.innerHTML=`${i.name} x ${i.qty} = ฿${(i.price*i.qty).toFixed(2)}`; list.appendChild(row); });
    r.appendChild(h); r.appendChild(list);
  }catch(err){ console.error(err); }
}

// Auth forms
document.addEventListener('submit', async (e)=>{
  if (e.target.id==='loginForm'){
    e.preventDefault();
    const fd=new FormData(e.target);
    const body=Object.fromEntries(fd.entries());
    await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    location.href='/';
  } else if (e.target.id==='registerForm'){
    e.preventDefault();
    const fd=new FormData(e.target);
    const body=Object.fromEntries(fd.entries());
    await fetch('/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    location.href='/login.html';
  } else if (e.target.id==='productForm'){
    e.preventDefault();
    const form = e.target;
    const id = form.id.value;
    const fd = new FormData(form);
    try{
      if (id){
        await fetch('/api/products/'+id,{method:'PUT',body:fd});
      } else {
        await fetch('/api/products',{method:'POST',body:fd});
      }
      form.reset();
      loadAdminProducts();
      alert('บันทึกแล้ว');
    }catch(err){
      alert(err.error||'error');
    }
  }
});

// Admin product management
async function loadAdminProducts(){
  const list = el('#productList');
  if (!list) return;
  list.innerHTML = '';
  const prods = await api('/products');
  prods.forEach(p=>{
    const row = create('div','card');
    row.innerHTML = `<strong>${p.name}</strong> <div>฿${(Number(p.price)||0).toFixed(2)}</div>`;
    const img = create('img'); img.src = p.image||'/placeholder.png'; img.style.width='80px'; img.style.height='60px'; img.style.objectFit='cover'; img.style.float='right';
    const edit = create('button'); edit.textContent='แก้ไข'; edit.onclick=()=>{
      const form = el('#productForm'); form.id.value=p.id; form.name.value=p.name; form.description.value=p.description; form.price.value=p.price;
    };
    const del = create('button'); del.textContent='ลบ'; del.style.background='#aa3355'; del.onclick=async ()=>{ if(confirm('ลบใช่ไหม?')){ await fetch('/api/products/'+p.id,{method:'DELETE'}); loadAdminProducts(); }};
    row.appendChild(img); row.appendChild(edit); row.appendChild(del);
    list.appendChild(row);
  });
}

// Simple init on index/admin pages
document.addEventListener('DOMContentLoaded', async ()=>{
  try{ await fetch('/api/me'); }catch(e){}
  loadProducts();
  updateCartCount();
  if (location.pathname.endsWith('admin.html')){
    // show admin area
    try{
      const me = await api('/me');
      if (!me.loggedIn) return location.href='/login.html';
      if (me.role!=='admin') return alert('ต้องเป็นผู้ดูแล');
      loadAdminProducts();
      el('#logoutBtn').addEventListener('click', async ()=>{ await fetch('/api/logout',{method:'POST'}); location.href='/'; });
    }catch(err){ console.error(err); location.href='/login.html'; }
  }
  if (location.pathname.endsWith('checkout.html')) renderCheckout();
  if (location.pathname.endsWith('receipt.html')) renderReceipt();
});
