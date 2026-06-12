// Speed Logística — Motoboy PWA Logic

const SUPABASE_URL = 'https://evupemncvectyyeoeajz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dXBlbW5jdmVjdHl5ZW9lYWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjEyOTEsImV4cCI6MjA5NjMzNzI5MX0.QKW38pTwzkkTUKZqz5JUopOws9ftWJBYHMF4xICxips';

let db = null;
let currentRider = null;  // fleet row of logged-in motoboy
let riderMap = null;      // Leaflet map instance
let realtimeChannel = null;
let watchId = null;       // geolocation watch ID
let lastPosition = null;  // { lat, lng }

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (window.supabase) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  lucide.createIcons();
  registerSW();

  // Check for persisted session
  const saved = localStorage.getItem('speedMotoSession');
  if (saved) {
    try {
      currentRider = JSON.parse(saved);
      showApp();
      loadMyDeliveries();
      startGeolocation();
    } catch {
      localStorage.removeItem('speedMotoSession');
    }
  }
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

async function handleMotoLogin(e) {
  e.preventDefault();

  const rawId  = document.getElementById('moto-id').value.trim().toUpperCase();
  const pin    = document.getElementById('moto-pin').value.trim();
  const btn    = document.getElementById('login-btn');
  const errEl  = document.getElementById('login-error');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.innerText = 'Verificando...';

  if (!db) {
    showLoginError('Serviço indisponível. Tente novamente.');
    btn.disabled = false;
    btn.innerText = 'Entrar';
    return;
  }

  // The ID stored in Supabase is like "#MB-123" — normalize input
  const motoboyId = rawId.startsWith('#') ? rawId : '#' + rawId;

  const { data, error } = await db
    .from('fleet')
    .select('*')
    .eq('id', motoboyId)
    .eq('pin', pin)
    .maybeSingle();

  btn.disabled = false;
  btn.innerText = 'Entrar';

  if (error || !data) {
    showLoginError('ID ou PIN incorreto. Contate o administrador.');
    return;
  }

  currentRider = data;
  localStorage.setItem('speedMotoSession', JSON.stringify(data));
  showApp();
  loadMyDeliveries();
  startGeolocation();
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.innerText = msg;
  el.classList.remove('hidden');
}

function handleMotoLogout() {
  if (!confirm('Sair do aplicativo?')) return;
  localStorage.removeItem('speedMotoSession');
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  if (watchId) navigator.geolocation.clearWatch(watchId);
  currentRider = null;
  document.getElementById('pwa-app').classList.add('hidden');
  document.getElementById('pwa-login').classList.remove('hidden');
  document.getElementById('moto-id').value = '';
  document.getElementById('moto-pin').value = '';
  lucide.createIcons();
}

// ─── SCREEN TRANSITIONS ───────────────────────────────────────────────────────

function showApp() {
  document.getElementById('pwa-login').classList.add('hidden');
  document.getElementById('pwa-app').classList.remove('hidden');

  // Fill header info
  document.getElementById('pwa-rider-name').innerText = currentRider.name || 'Motoboy';
  setRiderStatusBadge(currentRider.status || 'Disponível');

  // Switch to teles tab by default
  switchPWATab('teles');
  subscribeRealtime();
  lucide.createIcons();
}

function setRiderStatusBadge(status) {
  const el = document.getElementById('pwa-rider-status');
  el.innerText = status;
  el.className = 'pwa-status-badge';
  if (status === 'Disponível') el.classList.add('badge-available');
  else if (status.includes('Descanso')) el.classList.add('badge-rest');
  else el.classList.add('badge-busy');
}

// ─── TAB NAVIGATION ──────────────────────────────────────────────────────────

function switchPWATab(tab) {
  document.querySelectorAll('.pwa-tab').forEach(t => t.classList.add('hidden'));
  document.querySelectorAll('.pwa-nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('pwa-tab-' + tab).classList.remove('hidden');
  document.getElementById('pwa-nav-' + tab).classList.add('active');

  if (tab === 'map') {
    setTimeout(() => {
      if (!riderMap) initRiderMap();
      else riderMap.invalidateSize();
    }, 100);
  }
  lucide.createIcons();
}

// ─── LOAD DELIVERIES ─────────────────────────────────────────────────────────

async function loadMyDeliveries() {
  const container = document.getElementById('pwa-teles-container');
  container.innerHTML = `
    <div class="pwa-loading">
      <div class="pwa-spinner"></div>
      <p>Carregando teles...</p>
    </div>
  `;

  if (!db || !currentRider) return;

  const { data, error } = await db
    .from('client_history')
    .select('*')
    .eq('rider', currentRider.name)
    .neq('status', 'Entregue')
    .order('id', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="pwa-empty-msg">Erro ao carregar teles. Tente novamente.</p>`;
    return;
  }

  renderTeleCards(data || []);
}

function renderTeleCards(deliveries) {
  const container = document.getElementById('pwa-teles-container');

  if (deliveries.length === 0) {
    container.innerHTML = `
      <div class="pwa-empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        <p>Nenhuma tele ativa no momento.</p>
        <span>Aguardando despacho do administrador.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  deliveries.forEach(order => {
    const isPickup   = order.status === 'A caminho da coleta';
    const isTransit  = order.status === 'Em rota de entrega';

    const card = document.createElement('div');
    card.className = 'pwa-tele-card';
    card.innerHTML = `
      <div class="pwa-tele-header">
        <strong class="pwa-tele-id">${order.id}</strong>
        <span class="pwa-tele-status ${order.status_class || 'status-progress'}">${order.status}</span>
      </div>
      <div class="pwa-tele-body">
        <div class="pwa-tele-row">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${order.address}</span>
        </div>
        <div class="pwa-tele-row pwa-tele-meta">
          <span>Distância: <strong>${order.dist}</strong></span>
          <span>Taxa: <strong class="pwa-highlight">${order.price}</strong></span>
        </div>
      </div>
      <div class="pwa-tele-footer">
        ${isPickup ? `
          <button class="pwa-btn pwa-btn-primary" onclick="confirmPickup('${order.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v6c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Confirmar Coleta
          </button>
        ` : ''}
        ${isTransit ? `
          <button class="pwa-btn pwa-btn-success" onclick="confirmDelivery('${order.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
            Confirmar Entrega
          </button>
        ` : ''}
        ${!isPickup && !isTransit ? `
          <span class="pwa-tele-waiting">Aguardando início...</span>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// ─── DELIVERY ACTIONS ─────────────────────────────────────────────────────────

async function confirmPickup(deliveryId) {
  if (!db) return;
  const btn = event.target.closest('button');
  if (btn) { btn.disabled = true; btn.innerText = 'Confirmando...'; }

  const { error } = await db
    .from('client_history')
    .update({ status: 'Em rota de entrega', status_class: 'status-progress' })
    .eq('id', deliveryId);

  if (error) {
    alert('Erro ao confirmar coleta. Tente novamente.');
    if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Coleta'; }
    return;
  }

  // Update fleet rider status
  await db
    .from('fleet')
    .update({ status: 'Em rota de entrega', status_class: 'status-progress' })
    .eq('name', currentRider.name);

  currentRider.status = 'Em rota de entrega';
  localStorage.setItem('speedMotoSession', JSON.stringify(currentRider));
  setRiderStatusBadge('Em rota de entrega');
  showPWAToast('Coleta confirmada! Boa entrega.');
  loadMyDeliveries();
}

async function confirmDelivery(deliveryId) {
  if (!db) return;
  const btn = event.target.closest('button');
  if (btn) { btn.disabled = true; btn.innerText = 'Finalizando...'; }

  const { error: histErr } = await db
    .from('client_history')
    .update({ status: 'Entregue', status_class: 'status-success' })
    .eq('id', deliveryId);

  if (histErr) {
    alert('Erro ao finalizar entrega. Tente novamente.');
    if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Entrega'; }
    return;
  }

  await db
    .from('fleet')
    .update({ status: 'Disponível', status_class: 'status-success', delivery: 'Nenhuma' })
    .eq('name', currentRider.name);

  currentRider.status = 'Disponível';
  localStorage.setItem('speedMotoSession', JSON.stringify(currentRider));
  setRiderStatusBadge('Disponível');
  showPWAToast(`Entrega ${deliveryId} concluída!`);
  loadMyDeliveries();
}

// ─── REALTIME SUBSCRIPTION ────────────────────────────────────────────────────

function subscribeRealtime() {
  if (!db || !currentRider) return;
  if (realtimeChannel) db.removeChannel(realtimeChannel);

  realtimeChannel = db.channel('moto-deliveries-' + currentRider.id)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'client_history',
      filter: `rider=eq.${currentRider.name}`
    }, () => {
      loadMyDeliveries();
    })
    .subscribe();
}

// ─── MAP ─────────────────────────────────────────────────────────────────────

function initRiderMap() {
  const mapEl = document.getElementById('pwa-map');
  if (!mapEl) return;

  riderMap = L.map('pwa-map', { zoomControl: true }).setView([-23.55052, -46.633308], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20
  }).addTo(riderMap);

  if (lastPosition) {
    placeRiderMarker(lastPosition.lat, lastPosition.lng);
  }
}

let riderMarker = null;

function placeRiderMarker(lat, lng) {
  if (!riderMap) return;

  const iconHtml = `
    <div style="width:22px;height:22px;background:#ff00aa;border-radius:50%;border:3px solid #fff;box-shadow:0 0 12px rgba(255,0,170,0.7);display:flex;align-items:center;justify-content:center;">
      <div style="width:6px;height:6px;background:#fff;border-radius:50%;"></div>
    </div>
  `;
  const icon = L.divIcon({ html: iconHtml, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });

  if (riderMarker) {
    riderMarker.setLatLng([lat, lng]);
  } else {
    riderMarker = L.marker([lat, lng], { icon }).addTo(riderMap);
    riderMarker.bindPopup(`<strong>${currentRider ? currentRider.name : 'Você'}</strong><br>Sua localização atual`);
  }

  riderMap.setView([lat, lng], 15);
}

function startGeolocation() {
  if (!navigator.geolocation) return;

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (riderMap) placeRiderMarker(lastPosition.lat, lastPosition.lng);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

function showPWAToast(msg) {
  let container = document.getElementById('pwa-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'pwa-toast-container';
    container.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:90%;max-width:360px;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = 'background:#181820;border-left:4px solid #ff00aa;border:1px solid #272732;border-left:4px solid #ff00aa;color:#f4f4f5;padding:14px 18px;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.4);font-size:0.9rem;font-weight:500;text-align:center;';
  toast.innerText = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
