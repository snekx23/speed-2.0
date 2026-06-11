// Speed Logistics - Core Application Logic

// Supabase Configuration
const supabaseUrl = 'https://evupemncvectyyeoeajz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2dXBlbW5jdmVjdHl5ZW9lYWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjEyOTEsImV4cCI6MjA5NjMzNzI5MX0.QKW38pTwzkkTUKZqz5JUopOws9ftWJBYHMF4xICxips';
let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
} else {
  console.error("Supabase SDK not loaded!");
}

// Mock Database States (updated dynamically from Supabase)
const mockData = {
  activeProfile: 'owner', // 'owner', 'client', 'order'
  fleet: [],
  clientHistory: [],
  credentials: {
    owner: { email: 'admin@speedlog.com.br', pass: 'admin123', name: 'Gustavo Souza', role: 'Dono & CEO', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?q=80&w=256&auto=format&fit=crop' },
    client: { email: 'gerente@burgerchef.com.br', pass: 'burger123', name: 'Roberto Heinz', role: 'Gerente - Burger Chef', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&auto=format&fit=crop' },
    order: { email: 'pedido@burgerchef.com.br', pass: 'express123', name: 'Roberto Heinz', role: 'Gerente - Burger Chef', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&auto=format&fit=crop' }
  },
  pendingDeliveries: []
};

// Global Chart and Map variables to allow proper reset/destroy
let ownerOverviewChart = null;
let ownerFinancialChart = null;
let clientOverviewChart = null;
let ownerFleetMap = null;
let selectedRiderId = null;
let selectedMapRiderId = null;
let clientRatings = [
  { score: 5, title: 'Entrega rápida e cordial', comment: 'Motoboy chegou antes do prazo e manteve o pedido em perfeito estado.', date: 'Hoje, 14:20' },
  { score: 5, title: 'Coleta sem espera', comment: 'Fluxo funcionou bem no horário de pico.', date: 'Ontem, 21:10' },
  { score: 4, title: 'Boa comunicação', comment: 'Avisou sobre o trânsito e finalizou sem atraso relevante.', date: 'Terça, 19:35' }
];

// Async functions to sync with Supabase
async function fetchFleet() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('fleet')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    mockData.fleet = data.map(item => ({
      id: String(item.id),
      name: item.name,
      vehicle: item.vehicle,
      plate: item.plate,
      status: item.status,
      delivery: item.delivery,
      battery: item.battery,
      rating: parseFloat(item.rating),
      statusClass: item.status_class,
      pin: item.pin || '—'
    }));
  } catch (err) {
    console.error("Error fetching fleet from Supabase:", err);
  }
}

// Generate next sequential Motoboy ID (#MB-0001, #MB-0002, ...)
async function getNextRiderID() {
  let maxNum = 0;
  if (supabaseClient) {
    const { data } = await supabaseClient.from('fleet').select('id');
    (data || []).forEach(item => {
      const match = (item.id || '').match(/#MB-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
  } else {
    mockData.fleet.forEach(r => {
      const match = (r.id || '').match(/#MB-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
  }
  return '#MB-' + String(maxNum + 1).padStart(4, '0');
}

async function fetchClientHistory() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('client_history')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;
    mockData.clientHistory = data.map(item => ({
      id: String(item.id),
      destName: item.dest_name,
      address: item.address,
      rider: item.rider,
      dist: item.dist,
      price: item.price,
      date: item.date,
      status: item.status,
      statusClass: item.status_class
    }));
  } catch (err) {
    console.error("Error fetching client history from Supabase:", err);
  }
}

async function fetchPendingDeliveries() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('pending_deliveries')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    mockData.pendingDeliveries = data.map(item => ({
      id: String(item.id),
      client: item.client,
      destName: item.dest_name,
      address: item.address,
      dist: item.dist,
      price: item.price,
      payment: item.payment,
      cargo: item.cargo
    }));
  } catch (err) {
    console.error("Error fetching pending deliveries from Supabase:", err);
  }
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker do Painel registrado:', reg.scope))
      .catch(err => console.error('Erro ao registrar Service Worker do Painel:', err));
  }

  // Hide loader after a simulated 1.2s delay for premium entry feel
  setTimeout(() => {
    const loader = document.getElementById('loader');
    loader.classList.add('hidden');
  }, 1200);

  // Always start at the access portal. Saved data is used only to prefill the selected profile.
  const savedProfile = localStorage.getItem('loggedInProfile');
  switchLoginTab(savedProfile && mockData.credentials[savedProfile] ? savedProfile : 'owner');
  
  // Set Date display in header
  const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('current-date-span').innerText = new Date().toLocaleDateString('pt-BR', options);

  // Initialize lucide icons
  lucide.createIcons();

  // Listen to payment method changes in order request form to toggle change input
  const paymentSelect = document.getElementById('payment-method');
  if (paymentSelect) {
    paymentSelect.addEventListener('change', (e) => {
      const changeGroup = document.getElementById('change-group');
      if (e.target.value === 'dinheiro') {
        changeGroup.style.display = 'flex';
      } else {
        changeGroup.style.display = 'none';
      }
    });
  }

  // Sidebar mobile drawer logic
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.querySelector('.sidebar');
  let overlay = document.getElementById('sidebar-overlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }
  
  function openMobileSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
  
  function closeMobileSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', openMobileSidebar);
  }
  const topbarLogo = document.getElementById('topbar-logo');
  if (topbarLogo) {
    topbarLogo.addEventListener('click', openMobileSidebar);
  }
  if (overlay) {
    overlay.addEventListener('click', closeMobileSidebar);
  }
  
  // Close sidebar on clicking navigation items on mobile
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    });
  });

  // Close sidebar on clicking logout on mobile
  const logoutBtn = document.querySelector('.btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeMobileSidebar();
      }
    });
  }
});

// Profile switching inside Landing Login Card
function switchLoginTab(profile) {
  mockData.activeProfile = profile;
  
  // Update UI active state of buttons
  document.querySelectorAll('.login-tabs .tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`.login-tabs .tab-btn[data-tab="${profile}"]`).classList.add('active');

  // Set default values based on profile selection
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const usernameLabel = document.getElementById('username-label');
  const passwordGroup = document.getElementById('password-group');

  const profileCreds = mockData.credentials[profile];
  
  if (profile === 'order') {
    usernameLabel.innerText = 'E-mail do Comércio';
    usernameInput.type = 'email';
    usernameInput.value = profileCreds.email;
    usernameInput.placeholder = 'estabelecimento@email.com';
    passwordInput.value = profileCreds.pass;
    passwordGroup.style.display = 'flex';
  } else if (profile === 'client') {
    usernameLabel.innerText = 'E-mail do Cliente (Lancheria)';
    usernameInput.type = 'email';
    usernameInput.value = profileCreds.email;
    usernameInput.placeholder = 'estabelecimento@email.com';
    passwordInput.value = profileCreds.pass;
    passwordGroup.style.display = 'flex';
  } else {
    usernameLabel.innerText = 'E-mail do Administrador';
    usernameInput.type = 'email';
    usernameInput.value = profileCreds.email;
    usernameInput.placeholder = 'admin@speedlog.com.br';
    passwordInput.value = profileCreds.pass;
    passwordGroup.style.display = 'flex';
  }
}

// Handle Login submit
function handleLogin(event) {
  if (event) event.preventDefault();
  
  // Show loader briefly to simulate validation
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');

  setTimeout(() => {
    loader.classList.add('hidden');
    loginSuccess();
  }, 800);
}

// Direct quick login demo trigger
function loginDemo() {
  handleLogin(null);
}

// Successful login flow setup
async function loginSuccess() {
  const profile = mockData.activeProfile;
  const creds = mockData.credentials[profile];

  const rememberInput = document.querySelector('.remember-me input');
  if (rememberInput && rememberInput.checked) {
    localStorage.setItem('loggedInProfile', profile);
  } else {
    localStorage.removeItem('loggedInProfile');
  }

  // Set Profile info in sidebar
  document.getElementById('user-avatar').src = creds.avatar;
  document.getElementById('user-display-name').innerText = creds.name;
  document.getElementById('user-display-sub').innerText = creds.role;

  // Toggle visible sidebar navigation items depending on role
  document.getElementById('nav-owner-group').classList.add('hidden');
  document.getElementById('nav-client-group').classList.add('hidden');
  document.getElementById('nav-order-group').classList.add('hidden');

  // Route to the appropriate view/dashboard tab
  document.getElementById('view-landing').classList.remove('active');
  document.getElementById('view-dashboard').classList.add('active');

  if (profile === 'owner') {
    document.getElementById('display-role').innerText = 'Painel do Dono';
    document.getElementById('nav-owner-group').classList.remove('hidden');
    document.getElementById('dashboard-title').innerText = 'Painel de Logística Speed';
    document.getElementById('dashboard-subtitle').innerText = 'Acompanhe a atividade em tempo real de toda a empresa.';
    
    // Fetch initial owner data from Supabase
    await fetchFleet();
    await fetchPendingDeliveries();

    // Switch to first owner tab
    switchDashboardTab('owner-overview');
    
    // Render Fleet table
    renderFleetTable();
  } else if (profile === 'client') {
    document.getElementById('display-role').innerText = 'Painel Cliente';
    document.getElementById('nav-client-group').classList.remove('hidden');
    document.getElementById('dashboard-title').innerText = 'Burger do Chef';
    document.getElementById('dashboard-subtitle').innerText = 'Métricas de desempenho e histórico de entregas da sua lancheria.';
    
    // Fetch initial client data from Supabase
    await fetchClientHistory();

    // Switch to first client tab
    switchDashboardTab('client-overview');
    
    // Render History table
    renderClientHistoryTable();
  } else if (profile === 'order') {
    document.getElementById('display-role').innerText = 'Pedir Entregador';
    document.getElementById('nav-order-group').classList.remove('hidden');
    document.getElementById('dashboard-title').innerText = 'Solicitação Exclusiva';
    document.getElementById('dashboard-subtitle').innerText = 'Painel expresso de chamadas de motoboy sob demanda.';
    
    // Switch to first order tab
    switchDashboardTab('order-request');
  }

  // Recalculate icon SVGs in the dashboard
  lucide.createIcons();
}

// Handle Logout
function handleLogout() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');

  // Clear session from local storage
  localStorage.removeItem('loggedInProfile');

  setTimeout(() => {
    loader.classList.add('hidden');
    
    // Hide Dashboards & Show Landing
    document.getElementById('view-dashboard').classList.remove('active');
    document.getElementById('view-landing').classList.add('active');
    
    // Clear dynamic variables
    resetTrackedOrder();
  }, 600);
}

// Switching dashboard tab views
async function switchDashboardTab(targetTab) {
  // Update Sidebar active items
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const navItem = document.querySelector(`.sidebar-nav .nav-item[data-tab="${targetTab}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }

  // Update Main Dashboard Views
  document.querySelectorAll('.dashboard-tab-content').forEach(view => {
    view.classList.remove('active');
  });

  const activeTabEl = document.getElementById(`tab-${targetTab}`);
  if (activeTabEl) {
    activeTabEl.classList.add('active');
  }

  // Trigger specific tab initializers (like charts render)
  if (targetTab === 'owner-overview') {
    initOwnerOverviewChart();
  } else if (targetTab === 'owner-fleet-map') {
    await fetchFleet();
    initOwnerFleetMap();
  } else if (targetTab === 'owner-teles') {
    await loadTelesManagement();
  } else if (targetTab === 'owner-fleet') {
    await fetchFleet();
    renderFleetTable();
  } else if (targetTab === 'owner-financials') {
    initOwnerFinancialChart();
  } else if (targetTab === 'owner-rider-payments') {
    await fetchFleet();
    await fetchClientHistory();
    renderRiderPayments();
  } else if (targetTab === 'client-overview') {
    initClientOverviewChart();
  } else if (targetTab === 'client-history') {
    await fetchClientHistory();
    renderClientHistoryTable();
  } else if (targetTab === 'client-ratings') {
    renderClientRatings();
  }
}

async function loadTelesManagement() {
  setTelesLoadingState();

  try {
    await Promise.all([
      fetchPendingDeliveries(),
      fetchFleet(),
      fetchClientHistory()
    ]);
  } catch (err) {
    console.error('Erro ao carregar dados da Gestão de Teles:', err);
    showTelesLoadError();
    return;
  }

  renderPendingDeliveries();
  renderActiveDeliveries();
}

function setTelesLoadingState() {
  const pendingContainer = document.getElementById('pending-deliveries-container');
  const activeContainer = document.getElementById('active-deliveries-container');
  const pendingBadge = document.getElementById('pending-count-badge');
  const activeBadge = document.getElementById('active-count-badge');

  if (pendingBadge) pendingBadge.innerText = 'carregando...';
  if (activeBadge) activeBadge.innerText = 'carregando...';

  const loadingCard = `
    <div class="tele-state-card">
      <div class="tele-state-spinner"></div>
      <p>Carregando teles...</p>
    </div>
  `;

  if (pendingContainer) pendingContainer.innerHTML = loadingCard;
  if (activeContainer) activeContainer.innerHTML = loadingCard;
}

function showTelesLoadError() {
  const pendingContainer = document.getElementById('pending-deliveries-container');
  const activeContainer = document.getElementById('active-deliveries-container');
  const pendingBadge = document.getElementById('pending-count-badge');
  const activeBadge = document.getElementById('active-count-badge');

  if (pendingBadge) pendingBadge.innerText = 'erro';
  if (activeBadge) activeBadge.innerText = 'erro';

  const errorCard = `
    <div class="tele-state-card tele-state-error">
      <i data-lucide="alert-triangle"></i>
      <p>Não foi possível carregar as teles.</p>
      <button class="btn btn-secondary btn-sm" onclick="loadTelesManagement()">Tentar novamente</button>
    </div>
  `;

  if (pendingContainer) pendingContainer.innerHTML = errorCard;
  if (activeContainer) activeContainer.innerHTML = errorCard;
  lucide.createIcons();
}

// Render the owner fleet table with mock data
function renderFleetTable() {
  const tbody = document.getElementById('owner-fleet-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  mockData.fleet.forEach(rider => {
    const tr = document.createElement('tr');
    tr.className = 'clickable-row';
    tr.onclick = () => openRiderActions(rider.id);
    tr.innerHTML = `
      <td>
        <div class="user-profile">
          <div class="item-icon-avatar bg-yellow"><i data-lucide="bike" class="text-black"></i></div>
          <div>
            <strong>${rider.name}</strong>
            <p class="text-muted text-xs">${rider.id}</p>
          </div>
        </div>
      </td>
      <td>
        <strong>${rider.vehicle}</strong>
        <p class="text-muted">${rider.plate}</p>
      </td>
      <td><span class="status-indicator ${rider.statusClass}">${rider.status}</span></td>
      <td><strong>${rider.delivery}</strong></td>
      <td>
        <div class="perf-bar-group" style="width: 100px;">
          <div class="perf-bar-label"><span class="text-xs">${rider.battery}</span></div>
          <div class="perf-bar">
            <div class="perf-bar-fill ${parseInt(rider.battery) > 50 ? 'bg-green' : (parseInt(rider.battery) > 25 ? 'bg-yellow' : 'bg-blue')}" style="width: ${parseInt(rider.battery)}%"></div>
          </div>
        </div>
      </td>
      <td>
        <div class="courier-rating">
          <i data-lucide="star" class="fill-yellow text-yellow"></i> <strong>${rider.rating.toFixed(2)}</strong>
        </div>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm icon-action-btn" onclick="event.stopPropagation(); openRiderActions('${rider.id}')" title="Ações do motoboy" aria-label="Ações do motoboy">
          <i data-lucide="settings"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function parseMoneyBR(value) {
  if (!value) return 0;
  return Number(String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

function formatMoneyBR(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getCurrentWeekRangeLabel() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = { day: '2-digit', month: '2-digit' };
  return `${monday.toLocaleDateString('pt-BR', fmt)} a ${sunday.toLocaleDateString('pt-BR', fmt)}`;
}

function getCurrentWeekBounds() {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function parseOrderDate(dateText) {
  const raw = String(dateText || '').trim();
  const now = new Date();
  if (!raw || raw.startsWith('Hoje')) return now;
  if (raw.startsWith('Ontem')) {
    const d = new Date(now);
    d.setDate(now.getDate() - 1);
    return d;
  }
  const brDate = raw.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
  if (brDate) {
    return new Date(Number(brDate[3] || now.getFullYear()), Number(brDate[2]) - 1, Number(brDate[1]));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

function isOrderInCurrentWeek(order) {
  const { monday, sunday } = getCurrentWeekBounds();
  const orderDate = parseOrderDate(order.date);
  return orderDate >= monday && orderDate <= sunday;
}

function renderRiderPayments() {
  const tbody = document.getElementById('rider-payments-table-body');
  if (!tbody) return;

  const totals = new Map();
  mockData.fleet.forEach(rider => totals.set(rider.name, { rider, count: 0, total: 0 }));

  mockData.clientHistory
    .filter(order => order.status === 'Entregue' && isOrderInCurrentWeek(order))
    .forEach(order => {
      if (!totals.has(order.rider)) {
        totals.set(order.rider, { rider: { name: order.rider, id: '—' }, count: 0, total: 0 });
      }
      const item = totals.get(order.rider);
      item.count += 1;
      item.total += parseMoneyBR(order.price);
    });

  const rows = Array.from(totals.values()).sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const totalEl = document.getElementById('rider-week-total');
  const rangeEl = document.getElementById('rider-week-range');
  if (totalEl) totalEl.innerText = formatMoneyBR(grandTotal);
  if (rangeEl) rangeEl.innerText = getCurrentWeekRangeLabel();

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <strong>${row.rider.name}</strong>
        <p class="text-muted">${row.rider.id || '—'}</p>
      </td>
      <td>${row.count}</td>
      <td><strong class="text-yellow">${formatMoneyBR(row.total)}</strong></td>
      <td>${formatMoneyBR(row.count ? row.total / row.count : 0)}</td>
      <td><span class="status-indicator ${row.total > 0 ? 'status-progress' : 'status-neutral'}">${row.total > 0 ? 'Programado para quinta' : 'Sem valor'}</span></td>
    </tr>
  `).join('');
}

// Render the client delivery history table
function renderClientHistoryTable() {
  const tbody = document.getElementById('client-history-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  mockData.clientHistory.forEach(order => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${order.id}</strong></td>
      <td>
        <strong>${order.destName}</strong>
        <p class="text-muted">${order.address}</p>
      </td>
      <td>${order.rider}</td>
      <td>${order.dist}</td>
      <td><strong class="text-yellow">${order.price}</strong></td>
      <td>${order.date}</td>
      <td><span class="status-indicator ${order.statusClass}">${order.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Generate next sequential TELE ID (#TELE-0001, #TELE-0002, ...)
async function getNextTeleId() {
  let maxNum = 0;
  if (supabaseClient) {
    const [{ data: pending }, { data: history }] = await Promise.all([
      supabaseClient.from('pending_deliveries').select('id'),
      supabaseClient.from('client_history').select('id')
    ]);
    [...(pending || []), ...(history || [])].forEach(item => {
      const match = (item.id || '').match(/#TELE-(\d+)/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
  }
  return '#TELE-' + String(maxNum + 1).padStart(4, '0');
}

// Calculate delivery price and distance on form inputs
function calculateEstimate() {
  const addressInput = document.getElementById('delivery-address').value;
  const estimateBox = document.getElementById('estimate-box');

  if (addressInput.length < 5) {
    estimateBox.classList.add('hidden');
    return;
  }

  // Seed standard generator based on address string length to keep values consistent while typing
  const seed = addressInput.length;
  const distance = parseFloat((1.5 + (seed % 10) * 1.2).toFixed(1)); // mock distance: 1.5km to 12.3km
  const minutes = Math.round(distance * 3.5 + 4); // mock speed minutes
  
  // Calculate price: Base R$ 7.90 + R$ 1.50 per km (rounded to 5 cents)
  let price = 7.90;
  if (distance > 2.0) {
    price += (distance - 2.0) * 1.50;
  }
  
  // Store values temporarily for form submission
  window.lastEstimate = {
    distance: distance + ' km',
    time: minutes + ' min',
    price: 'R$ ' + price.toFixed(2).replace('.', ',')
  };

  // Update UI values
  document.getElementById('est-distance').innerText = window.lastEstimate.distance;
  document.getElementById('est-time').innerText = window.lastEstimate.time;
  document.getElementById('est-price').innerText = window.lastEstimate.price;

  estimateBox.classList.remove('hidden');
}

// Submit delivery request and trigger live tracking simulation
async function submitDeliveryRequest(event) {
  event.preventDefault();

  const destAddress = document.getElementById('delivery-address').value;
  const cargoType = document.getElementById('cargo-type').value;
  const payMethod = document.getElementById('payment-method').value;
  const notes = document.getElementById('order-notes').value;

  if (!window.lastEstimate) return;

  // Generate sequential TELE ID
  const randomId = await getNextTeleId();
  
  // Format payment name
  const paymentStr = payMethod === 'pix' ? 'PIX (Pago pelo App)' : (payMethod === 'cartao-maquininha' ? 'Levar Maquininha' : 'Dinheiro (Troco para R$ ' + document.getElementById('change-amount').value + ')');
  // Format cargo name
  const cargoStr = cargoType === 'lanche' ? '🍔 Lanches e Bebidas' : (cargoType === 'pizza' ? '🍕 Pizza Família' : (cargoType === 'doce' ? '🍩 Doces e Sobremesas' : '📄 Papelada / Documentos'));

  // Create delivery payload for Supabase
  const newDelivery = {
    id: randomId,
    client: 'Burger do Chef',
    dest_name: 'Cliente Express',
    address: destAddress,
    dist: window.lastEstimate.distance,
    price: window.lastEstimate.price,
    payment: paymentStr,
    cargo: cargoStr
  };

  // Insert to Supabase pending_deliveries table
  if (supabaseClient) {
    const { error } = await supabaseClient
      .from('pending_deliveries')
      .insert([newDelivery]);
    if (error) {
      console.error("Error inserting delivery to Supabase:", error);
      alert("Erro ao criar a solicitação de entrega no Supabase.");
      return;
    }
  }

  // Setup tracker UI elements
  const newOrder = {
    id: randomId,
    destName: 'Cliente Express',
    address: destAddress,
    rider: 'Carlos Oliveira (Demo)',
    dist: window.lastEstimate.distance,
    price: window.lastEstimate.price,
    date: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    status: 'Buscando Entregador',
    statusClass: 'status-progress'
  };

  // Add order to local mock state history
  mockData.clientHistory.unshift(newOrder);

  // Setup tracker UI elements
  document.getElementById('tracker-order-id').innerText = randomId;
  document.getElementById('tracker-badge-status').innerText = 'Buscando Entregador';
  document.getElementById('tracker-badge-status').className = 'status-badge status-warning';
  
  // Enable tracking tab
  const trackingTabBtn = document.getElementById('nav-tracking-tab');
  if (trackingTabBtn) {
    trackingTabBtn.disabled = false;
    trackingTabBtn.querySelector('.pulse-dot').classList.remove('hidden');
  }
  
  // Reset stepper nodes status
  document.querySelectorAll('.step-node').forEach(node => {
    node.className = 'step-node';
    node.querySelector('.text-muted').innerText = '--:--';
  });
  
  // Set first step active
  document.getElementById('step-1').className = 'step-node active';
  document.getElementById('step-1-time').innerText = 'Confirmado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Hide Courier Profile card inside tracker initially
  document.getElementById('tracker-courier-box').classList.add('hidden');

  // Reset map motorcycle position to base starting location
  const moto = document.getElementById('map-moto');
  if (moto) {
    moto.style.transition = 'none';
    moto.style.top = '40%';
    moto.style.left = '10%';
  }

  // Switch view to tracking
  switchDashboardTab('order-tracking');

  // Trigger simulated logistics loop
  runLogisticsSimulation(newOrder);

  // Reset Request Form
  document.getElementById('order-request-form').reset();
  document.getElementById('estimate-box').classList.add('hidden');
  window.lastEstimate = null;
}

// Reset tracking tab to disabled once finished or logged out
function resetTrackedOrder() {
  const trackingTabBtn = document.getElementById('nav-tracking-tab');
  if (trackingTabBtn) {
    trackingTabBtn.disabled = true;
    trackingTabBtn.querySelector('.pulse-dot').classList.add('hidden');
  }
}

// simulated tracking timeline sequence
function runLogisticsSimulation(order) {
  const trackerStatus = document.getElementById('tracker-badge-status');
  const moto = document.getElementById('map-moto');

  // Time configurations (shortened for preview experience)
  // Step 1: Assigning Courier (3 seconds)
  setTimeout(() => {
    trackerStatus.innerText = 'Entregador Coletando';
    trackerStatus.className = 'status-badge status-progress';

    // Highlight step 1 as complete, step 2 active
    document.getElementById('step-1').className = 'step-node completed';
    document.getElementById('step-2').className = 'step-node active';
    document.getElementById('step-2-time').innerText = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Show rider profile info
    document.getElementById('tracker-courier-box').classList.remove('hidden');

    // Move motorcycle icon to pickup location (Burger do Chef shop at top: 70%, left: 30%)
    moto.style.transition = 'top 5s cubic-bezier(0.25, 0.46, 0.45, 0.94), left 5s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    moto.style.top = '70%';
    moto.style.left = '30%';

  }, 3000);

  // Step 2: Rider arrived at merchant and picked up package (9 seconds total, wait 1s)
  setTimeout(() => {
    trackerStatus.innerText = 'Em Rota de Entrega';
    trackerStatus.className = 'status-badge status-progress';

    // Highlight step 2 as complete, step 3 active
    document.getElementById('step-2').className = 'step-node completed';
    document.getElementById('step-3').className = 'step-node active';
    document.getElementById('step-3-time').innerText = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Move motorcycle icon from pickup to customer delivery location (top: 25%, left: 75%)
    moto.style.transition = 'top 10s linear, left 10s linear';
    moto.style.top = '25%';
    moto.style.left = '75%';

  }, 9000);

  // Step 3: Rider arrived at client and handed order (20 seconds total)
  setTimeout(() => {
    trackerStatus.innerText = 'Concluído';
    trackerStatus.className = 'status-badge status-success';

    // Highlight step 3 as complete, step 4 active
    document.getElementById('step-3').className = 'step-node completed';
    document.getElementById('step-4').className = 'step-node active';
    document.getElementById('step-4-time').innerText = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Update simulation record in internal storage
    order.status = 'Entregue';
    order.statusClass = 'status-success';
    
    // Update total dashboard metrics for simulation
    const metricsValEl = document.getElementById('client-total-orders');
    if (metricsValEl) {
      let currentVal = parseInt(metricsValEl.innerText);
      metricsValEl.innerText = (currentVal + 1);
    }
    const metricsCostEl = document.getElementById('client-total-cost');
    if (metricsCostEl) {
      let currentCost = parseFloat(metricsCostEl.innerText.replace('R$ ', '').replace('.', '').replace(',', '.'));
      let extraPrice = parseFloat(order.price.replace('R$ ', '').replace('.', '').replace(',', '.'));
      metricsCostEl.innerText = 'R$ ' + (currentCost + extraPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Clear tracking pulse
    document.getElementById('nav-tracking-tab').querySelector('.pulse-dot').classList.add('hidden');

  }, 20000);
  
  // Step 4: Fully finalize order tracker card states (23 seconds total)
  setTimeout(() => {
    document.getElementById('step-4').className = 'step-node completed';
  }, 23000);
}


/* ================= CHART INITIALIZATION ================= */

// Chart 1: Owner Overview deliveries
function initOwnerOverviewChart() {
  const ctx = document.getElementById('ownerOverviewChart');
  if (!ctx) return;

  if (ownerOverviewChart) {
    ownerOverviewChart.destroy();
  }

  ownerOverviewChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      datasets: [{
        label: 'Entregas Concluídas',
        data: [1200, 1420, 1310, 1580, 1920, 1842, 1100],
        borderColor: '#ff00aa',
        backgroundColor: 'rgba(255, 0, 170, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e9f' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e9f' }
        }
      }
    }
  });
}

// Chart 2: Owner Financials doughnut
function initOwnerFinancialChart() {
  const ctx = document.getElementById('ownerFinancialChart');
  if (!ctx) return;

  if (ownerFinancialChart) {
    ownerFinancialChart.destroy();
  }

  ownerFinancialChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Repasse Motoboys', 'Comissão Speed', 'Seguros / Taxas'],
      datasets: [{
        data: [71, 24, 5],
        backgroundColor: ['#ff00aa', '#00aeef', '#10b981'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#8e8e9f', font: { family: 'Inter', size: 12 } }
        }
      }
    }
  });
}

// Chart 3: Client Snack Bar performance comparison
function initClientOverviewChart() {
  const ctx = document.getElementById('clientOverviewChart');
  if (!ctx) return;

  if (clientOverviewChart) {
    clientOverviewChart.destroy();
  }

  clientOverviewChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
      datasets: [
        {
          label: 'Estimado (min)',
          data: [18, 18, 18, 20, 22, 22, 20],
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: 4
        },
        {
          label: 'Tempo Real (min)',
          data: [16, 15, 17, 19, 21, 20, 18],
          backgroundColor: '#ff00aa',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#8e8e9f' }
        }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e9f' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8e8e9f' }
        }
      }
    }
  });
}

// Map 1: Owner Fleet Monitoring Map
function initOwnerFleetMap() {
  const mapContainer = document.getElementById('owner-fleet-map');
  if (!mapContainer) return;

  // If map is already initialized, we just invalidate size to make sure it renders correctly
  if (ownerFleetMap) {
    setTimeout(() => {
      ownerFleetMap.invalidateSize();
    }, 100);
    return;
  }

  // Fallback central coordinates (São Paulo)
  let centerCoords = [-23.55052, -46.633308];

  // Create map instance
  ownerFleetMap = L.map('owner-fleet-map').setView(centerCoords, 14);

  // CartoDB Dark Matter tile layer for premium dark aesthetics
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20
  }).addTo(ownerFleetMap);

  // Try to fetch user geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        centerCoords = [position.coords.latitude, position.coords.longitude];
        ownerFleetMap.setView(centerCoords, 14);
        renderMapMarkers(centerCoords);
      },
      (error) => {
        console.warn("Geolocation failed or denied. Using fallback coordinates.", error);
        renderMapMarkers(centerCoords);
      }
    );
  } else {
    renderMapMarkers(centerCoords);
  }
}

// Render markers on the map relative to the center coordinate
function renderMapMarkers(centerCoords) {
  // Clear any existing markers (if any)
  ownerFleetMap.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      ownerFleetMap.removeLayer(layer);
    }
  });

  // 1. Add Owner/Central marker (You)
  const centralIconHtml = `
    <div class="custom-map-marker central-marker" style="background-color: #ffffff; box-shadow: 0 0 15px #ffffff; border-color: var(--primary);">
      <div class="marker-pulse" style="border-color: var(--primary); animation-duration: 2.5s;"></div>
      <i class="marker-icon-dot" style="background-color: var(--primary); width: 6px; height: 6px; border-radius: 50%; display: block;"></i>
    </div>
  `;
  const centralIcon = L.divIcon({
    html: centralIconHtml,
    className: 'custom-div-icon',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
  
  L.marker(centerCoords, { icon: centralIcon })
    .addTo(ownerFleetMap)
    .bindPopup(`
      <div class="map-popup-card">
        <h4 style="color: var(--color-text); margin: 0 0 4px 0; font-family: var(--font-display); font-weight: 700;">Sua Central</h4>
        <p style="margin: 0; font-size: 0.8rem; color: var(--color-text-muted);">Localização em tempo real</p>
      </div>
    `);

  // Offsets to distribute riders around the center coordinates
  const offsets = [
    [0.004, -0.006],
    [0.008, 0.012],
    [-0.005, 0.009],
    [-0.012, -0.004],
    [0.003, -0.015],
    [-0.009, 0.005]
  ];

  // Fallback demo riders when Supabase does not return fleet rows.
  const demoRidersLocations = [
    { name: 'Carlos Oliveira', vehicle: 'Honda CG 160 Fan', plate: 'ABC-1234', status: 'A caminho da coleta', statusColor: '#ff00aa', offset: offsets[0] },
    { name: 'Marcos Santos', vehicle: 'Yamaha YZF-R3', plate: 'XYZ-9876', status: 'Em rota de entrega', statusColor: '#ff00aa', offset: offsets[1] },
    { name: 'Julia Costa', vehicle: 'Shineray XY 50', plate: 'MNO-5432', status: 'Disponível', statusColor: '#00aeef', offset: offsets[2] },
    { name: 'Roberto Lima', vehicle: 'Honda Biz 125', plate: 'PQR-8765', status: 'Em Descanso', statusColor: '#8e8e9f', offset: offsets[3] },
    { name: 'Aline Dias', vehicle: 'Voltz EVS (Elétrica)', plate: 'ELE-2026', status: 'Em rota de entrega', statusColor: '#ff00aa', offset: offsets[4] },
    { name: 'Lucas Souza', vehicle: 'Yamaha Fazer 250', plate: 'DEF-4321', status: 'Disponível', statusColor: '#00aeef', offset: offsets[5] }
  ];
  const ridersLocations = mockData.fleet.length
    ? mockData.fleet.map((rider, index) => ({
        id: rider.id,
        name: rider.name,
        vehicle: rider.vehicle,
        plate: rider.plate,
        status: rider.status,
        statusColor: rider.status === 'Em Descanso' ? '#8e8e9f' : (rider.statusClass === 'status-progress' ? '#ff00aa' : '#00aeef'),
        offset: offsets[index % offsets.length]
      }))
    : demoRidersLocations;

  // Add markers to map
  ridersLocations.forEach(rider => {
    // Find matching rider details in mockData.fleet to make sure status is accurate
    const mockRider = mockData.fleet.find(r => r.name === rider.name);
    const currentStatus = mockRider ? mockRider.status : rider.status;
    const currentStatusColor = mockRider 
      ? (mockRider.status === 'Em Descanso' ? '#8e8e9f' : (mockRider.statusClass === 'status-progress' ? '#ff00aa' : '#00aeef')) 
      : rider.statusColor;

    const riderCoords = [centerCoords[0] + rider.offset[0], centerCoords[1] + rider.offset[1]];
    const isPulsing = currentStatus !== 'Em Descanso';
    const markerHtml = `
      <div class="custom-map-marker" style="background-color: ${currentStatusColor}; box-shadow: 0 0 10px ${currentStatusColor};">
        ${isPulsing ? `<div class="marker-pulse" style="border-color: ${currentStatusColor};"></div>` : ''}
        <i class="marker-icon-dot"></i>
      </div>
    `;

    const customIcon = L.divIcon({
      html: markerHtml,
      className: 'custom-div-icon',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker(riderCoords, { icon: customIcon }).addTo(ownerFleetMap);

    // Generate pending deliveries options for popup dropdown
    let dispatchHtml = '';
    if (currentStatus !== 'Em Descanso') {
      if (mockData.pendingDeliveries.length > 0) {
        const deliveryOptions = mockData.pendingDeliveries
          .map(d => `<option value="${d.id}">${d.id} - ${d.client} (${d.dist})</option>`)
          .join('');

        const riderIdSafe = mockRider ? mockRider.id.replace('#', '') : rider.name.replace(/\W/g, '');

        dispatchHtml = `
          <div class="map-popup-dispatch">
            <label>Enviar tele para este motoboy</label>
            <select id="popup-select-delivery-${riderIdSafe}" class="map-popup-select">
                <option value="" disabled selected>Escolha a tele...</option>
                ${deliveryOptions}
            </select>
            <div class="map-popup-actions">
              <button class="map-popup-send-btn" onclick="handlePopupDispatch('${rider.name}')">
                <i data-lucide="send"></i>
                <span>Enviar</span>
              </button>
              ${mockRider ? `
                <button class="map-popup-remove-btn" onclick="openRemoveTeleModal('${mockRider.id}')">Remover tele</button>
                <button class="map-popup-settings-btn" onclick="openRiderActions('${mockRider.id}')" title="Funções do motoboy" aria-label="Funções do motoboy">
                  <i data-lucide="settings"></i>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      } else {
        dispatchHtml = `
          <div class="map-popup-dispatch map-popup-empty-actions">
            <span>Nenhuma tele pendente.</span>
            ${mockRider ? `
              <div class="map-popup-actions">
                <button class="map-popup-remove-btn" onclick="openRemoveTeleModal('${mockRider.id}')">Remover tele</button>
                <button class="map-popup-settings-btn" onclick="openRiderActions('${mockRider.id}')" title="Funções do motoboy" aria-label="Funções do motoboy">
                  <i data-lucide="settings"></i>
                </button>
              </div>
            ` : ''}
          </div>
        `;
      }
    }

    // Popup custom content
    const popupContent = `
      <div class="map-popup-card">
        <h4>${rider.name}</h4>
        <p>${rider.vehicle} • <strong>${rider.plate}</strong></p>
        <span class="status-indicator" style="display: inline-block; padding: 2px 8px; font-size: 0.7rem; border-radius: 10px; font-weight: 600; color: ${currentStatusColor === '#8e8e9f' ? 'var(--color-text-muted)' : (currentStatusColor === '#ff00aa' ? 'var(--primary)' : 'var(--accent-cyan)')}; background: ${currentStatusColor === '#8e8e9f' ? 'rgba(142, 142, 159, 0.15)' : (currentStatusColor === '#ff00aa' ? 'var(--primary-glow)' : 'var(--accent-cyan-glow)')};">${currentStatus}</span>
        ${dispatchHtml}
      </div>
    `;

    marker.bindPopup(popupContent);
    marker.on('popupopen', () => lucide.createIcons());
    if (mockRider && selectedMapRiderId === mockRider.id) {
      ownerFleetMap.setView(riderCoords, 16);
      setTimeout(() => marker.openPopup(), 150);
    }
  });
}

// Render pending deliveries (dispatch system) cards
function renderPendingDeliveries() {
  const container = document.getElementById('pending-deliveries-container');
  if (!container) return;

  const pendingBadge = document.getElementById('pending-count-badge');
  if (pendingBadge) pendingBadge.innerText = mockData.pendingDeliveries.length + ' pendentes';

  if (mockData.pendingDeliveries.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background-color: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--border-radius-md); color: var(--color-text-muted);">
        <i data-lucide="check-circle" style="width: 48px; height: 48px; color: var(--success); margin-bottom: 12px; display: inline-block;"></i>
        <p style="font-weight: 600; color: var(--color-text);">Tudo em ordem!</p>
        <p style="font-size: 0.9rem;">Nenhuma tele pendente de despacho no momento.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = '';
  mockData.pendingDeliveries.forEach(delivery => {
    // Generate active riders list options for dropdown
    const activeRidersOptions = mockData.fleet
      .filter(rider => rider.status !== 'Em Descanso')
      .map(rider => `<option value="${rider.id}">${rider.name} (${rider.status})</option>`)
      .join('');

    const card = document.createElement('div');
    card.className = 'pending-card';
    card.innerHTML = `
      <div class="pending-card-header">
        <strong style="font-family: var(--font-display);">${delivery.id}</strong>
        <span class="badge badge-warning" style="background: var(--primary-glow); color: var(--primary);">${delivery.client}</span>
      </div>
      <div class="pending-card-body">
        <p><strong>Destino:</strong> ${delivery.destName}</p>
        <p class="text-muted text-xs" style="margin-top: 4px; display: flex; align-items: center; gap: 4px;"><i data-lucide="map-pin" style="width: 12px; height: 12px;"></i> ${delivery.address}</p>
        <p style="margin-top: 6px;"><strong>Mercadoria:</strong> ${delivery.cargo}</p>
        <p><strong>Valor:</strong> <span class="text-yellow" style="color: var(--primary) !important;">${delivery.price}</span> (${delivery.payment})</p>
      </div>
      <div class="pending-card-footer" style="display: flex; gap: 8px; align-items: flex-end; margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <div class="form-group flex-1" style="margin-bottom: 0;">
          <label style="font-size: 0.75rem; margin-bottom: 4px; display: block; color: var(--color-text-muted);">Enviar para:</label>
          <div class="input-wrapper" style="width: 100%;">
            <select id="select-rider-${delivery.id.replace('#', '')}" style="background-color: var(--bg-input); border: 1px solid var(--border-color); color: var(--color-text); padding: 8px 10px; font-size: 0.8rem; border-radius: 4px; width: 100%; outline: none; appearance: none; cursor: pointer;">
              <option value="" disabled selected>Selecionar Motoboy</option>
              ${activeRidersOptions}
            </select>
          </div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="handleDispatchClick('${delivery.id}')" style="padding: 8px 12px; font-size: 0.8rem; border-radius: 4px; height: 33px; min-width: 40px; display: flex; justify-content: center; align-items: center;">
          <i data-lucide="send"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

// Wrapper function to dispatch from lists button click
window.handleDispatchClick = function(deliveryId) {
  const safeId = deliveryId.replace('#', '');
  const select = document.getElementById(`select-rider-${safeId}`);
  if (!select || !select.value) {
    alert("Por favor, selecione um motoboy para enviar esta tele!");
    return;
  }
  dispatchDelivery(deliveryId, select.value);
};

// Global handler for popup dispatch
window.handlePopupDispatch = function(riderName) {
  // Find rider by name to get ID
  const rider = mockData.fleet.find(r => r.name === riderName);
  if (!rider) return;

  const select = document.getElementById(`popup-select-delivery-${rider.id.replace('#', '')}`);
  if (!select || !select.value) {
    alert("Por favor, selecione uma entrega para enviar!");
    return;
  }

  // Close map popups before dispatching
  if (ownerFleetMap) {
    ownerFleetMap.closePopup();
  }

  dispatchDelivery(select.value, rider.id);
};

// Dispatch delivery function
async function dispatchDelivery(deliveryId, riderId) {
  // Find delivery
  const deliveryIndex = mockData.pendingDeliveries.findIndex(d => d.id === deliveryId);
  if (deliveryIndex === -1) return;
  const delivery = mockData.pendingDeliveries[deliveryIndex];

  // Find rider
  const rider = mockData.fleet.find(r => r.id === riderId);
  if (!rider) return;

  if (supabaseClient) {
    // 1. Update rider status and delivery in fleet table
    const { error: fleetError } = await supabaseClient
      .from('fleet')
      .update({
        status: 'A caminho da coleta',
        status_class: 'status-progress',
        delivery: deliveryId
      })
      .eq('id', riderId);

    if (fleetError) {
      console.error("Error updating rider status on Supabase:", fleetError);
      alert("Erro ao atualizar o status do motoboy no Supabase.");
      return;
    }

    // 2. Delete delivery from pending_deliveries table
    const { error: deleteError } = await supabaseClient
      .from('pending_deliveries')
      .delete()
      .eq('id', deliveryId);

    if (deleteError) {
      console.error("Error deleting pending delivery on Supabase:", deleteError);
      alert("Erro ao remover a tele das pendências no Supabase.");
      return;
    }

    // 3. Add order details into client_history table
    const newHistoryItem = {
      id: deliveryId,
      dest_name: delivery.destName,
      address: delivery.address,
      rider: rider.name,
      dist: delivery.dist,
      price: delivery.price,
      date: 'Hoje, ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      status: 'A caminho da coleta',
      status_class: 'status-progress'
    };

    const { error: historyError } = await supabaseClient
      .from('client_history')
      .insert([newHistoryItem]);

    if (historyError) {
      console.error("Error inserting delivery history on Supabase:", historyError);
      alert("Erro ao salvar o histórico de entrega no Supabase.");
      return;
    }
  }

  // Refresh all state arrays from Supabase
  await fetchPendingDeliveries();
  await fetchFleet();
  await fetchClientHistory();

  // Re-render components
  renderPendingDeliveries();
  renderActiveDeliveries();
  renderFleetTable();
  renderClientHistoryTable();

  // Get current active map coordinates (from geolocation or fallback)
  // Re-render the map markers to show the updated status
  if (ownerFleetMap) {
    const center = ownerFleetMap.getCenter();
    renderMapMarkers([center.lat, center.lng]);
  }

  // Display Premium Alert/Notification
  showToastNotification(`Tele ${deliveryId} enviada com sucesso para ${rider.name}!`);
}

// Render active deliveries (deliveries currently with riders)
function renderActiveDeliveries() {
  const container = document.getElementById('active-deliveries-container');
  if (!container) return;

  // Find active deliveries in mockData.clientHistory (status is not 'Entregue')
  const activeOrders = mockData.clientHistory.filter(order => order.status !== 'Entregue');

  const activeBadge = document.getElementById('active-count-badge');
  if (activeBadge) activeBadge.innerText = activeOrders.length + ' em rota';

  if (activeOrders.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background-color: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--border-radius-md); color: var(--color-text-muted);">
        <i data-lucide="check-circle" style="width: 48px; height: 48px; color: var(--color-text-muted); margin-bottom: 12px; display: inline-block;"></i>
        <p style="font-weight: 600; color: var(--color-text);">Nenhuma tele em trânsito</p>
        <p style="font-size: 0.9rem;">Todos os motoboys estão aguardando despacho.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = '';
  activeOrders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'active-card';
    card.innerHTML = `
      <div class="active-card-header">
        <strong style="font-family: var(--font-display);">${order.id}</strong>
        <span class="badge badge-success" style="background: var(--accent-cyan-glow); color: var(--accent-cyan); border-color: rgba(0, 174, 239, 0.2);">${order.rider}</span>
      </div>
      <div class="active-card-body">
        <p><strong>Destino:</strong> ${order.destName}</p>
        <p class="text-muted text-xs" style="margin-top: 4px; display: flex; align-items: center; gap: 4px;"><i data-lucide="map-pin" style="width: 12px; height: 12px;"></i> ${order.address}</p>
        <p style="margin-top: 6px;"><strong>Distância:</strong> ${order.dist} • <strong>Taxa:</strong> ${order.price}</p>
        <p style="margin-top: 4px;"><strong>Status:</strong> <span class="status-indicator ${order.statusClass}">${order.status}</span></p>
      </div>
      <div class="active-card-footer" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <button class="btn btn-secondary btn-sm" onclick="handleCompleteClick('${order.id}', '${order.rider}')" style="padding: 6px 12px; font-size: 0.8rem; border-radius: 4px; height: 30px; cursor: pointer; display: flex; align-items: center; gap: 6px; background-color: var(--secondary); color: var(--color-text); border: 1px solid var(--border-color);">
          <i data-lucide="check-circle" style="width: 14px; height: 14px; color: var(--success);"></i> Concluir Entrega
        </button>
      </div>
    `;
    container.appendChild(card);
  });
  lucide.createIcons();
}

// Complete delivery function
async function completeDelivery(deliveryId, riderName) {
  if (supabaseClient) {
    // 1. Update delivery status to Entregue in client_history table
    const { error: historyError } = await supabaseClient
      .from('client_history')
      .update({
        status: 'Entregue',
        status_class: 'status-success'
      })
      .eq('id', deliveryId);

    if (historyError) {
      console.error("Error completing delivery in client history on Supabase:", historyError);
      alert("Erro ao atualizar o histórico de entrega no Supabase.");
      return;
    }

    // 2. Find rider and update status to Disponivel and clear delivery
    const { error: fleetError } = await supabaseClient
      .from('fleet')
      .update({
        status: 'Disponível',
        status_class: 'status-success',
        delivery: 'Nenhuma'
      })
      .eq('name', riderName);

    if (fleetError) {
      console.error("Error resetting rider status on Supabase:", fleetError);
      alert("Erro ao liberar o motoboy no Supabase.");
      return;
    }
  }

  // Refresh all state arrays from Supabase
  await fetchPendingDeliveries();
  await fetchFleet();
  await fetchClientHistory();

  // Re-render components
  renderPendingDeliveries();
  renderActiveDeliveries();
  renderFleetTable();
  renderClientHistoryTable();

  // Re-render map markers
  if (ownerFleetMap) {
    const center = ownerFleetMap.getCenter();
    renderMapMarkers([center.lat, center.lng]);
  }

  // Display toast notification
  showToastNotification(`Tele ${deliveryId} concluída e entregue!`);
}

// Global click handler wrapper
window.handleCompleteClick = function(deliveryId, riderName) {
  if (confirm(`Deseja concluir e finalizar a entrega ${deliveryId} realizada por ${riderName}?`)) {
    completeDelivery(deliveryId, riderName);
  }
};

/* ================= CREDENTIAL CARD ================= */

// Armazena as credenciais abertas no momento
let _currentCreds = { id: '', name: '', pin: '' };
let _pinVisible = false;

function openCredentialCard(id, name, pin) {
  _currentCreds = { id, name, pin };
  _pinVisible = false;

  document.getElementById('cred-name').innerText = name;
  document.getElementById('cred-id').innerText = id;
  document.getElementById('cred-pin').innerText = '••••';

  const toggleBtn = document.getElementById('pin-toggle-btn');
  if (toggleBtn) toggleBtn.innerHTML = '<i data-lucide="eye"></i>';

  document.getElementById('modal-credentials').classList.remove('hidden');
  lucide.createIcons();
}

function closeCredentials(event) {
  if (event && event.target !== document.getElementById('modal-credentials')) return;
  document.getElementById('modal-credentials').classList.add('hidden');
}

function togglePinVisibility() {
  _pinVisible = !_pinVisible;
  const pinEl = document.getElementById('cred-pin');
  const toggleBtn = document.getElementById('pin-toggle-btn');
  pinEl.innerText = _pinVisible ? _currentCreds.pin : '••••';
  toggleBtn.innerHTML = _pinVisible
    ? '<i data-lucide="eye-off"></i>'
    : '<i data-lucide="eye"></i>';
  lucide.createIcons();
}

function copyCredentials() {
  const text = `Speed Logística — Acesso Motoboy\nNome: ${_currentCreds.name}\nID: ${_currentCreds.id}\nPIN: ${_currentCreds.pin}\nAcesso: https://speed-zztn.vercel.app/motoboy.html`;
  navigator.clipboard.writeText(text).then(() => {
    showToastNotification('Credenciais copiadas!');
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToastNotification('Credenciais copiadas!');
  });
}

function shareWhatsApp() {
  const text = encodeURIComponent(
    `*Speed Logística — Seu Acesso*\n\nOlá, ${_currentCreds.name}! Suas credenciais de acesso ao app de motoboy são:\n\n*ID:* ${_currentCreds.id}\n*PIN:* ${_currentCreds.pin}\n\n*Link:* https://speed-zztn.vercel.app/motoboy.html\n\n_Não compartilhe seu PIN com ninguém._`
  );
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

// Mostra credenciais de um motoboy já cadastrado
function viewRiderCredentials(riderId) {
  const rider = mockData.fleet.find(r => r.id === riderId);
  if (!rider) return;
  openCredentialCard(rider.id, rider.name, rider.pin || '(sem PIN)');
}

function getActiveOrdersForRider(rider) {
  if (!rider) return [];
  return mockData.clientHistory.filter(order => order.rider === rider.name && order.status !== 'Entregue' && order.status !== 'Removida');
}

function openRemoveTeleModal(riderId) {
  const rider = mockData.fleet.find(r => r.id === riderId);
  if (!rider) return;

  selectedRiderId = riderId;
  const modal = document.getElementById('modal-remove-tele');
  const list = document.getElementById('remove-tele-list');
  const label = document.getElementById('remove-tele-rider-label');
  const orders = getActiveOrdersForRider(rider);

  label.innerText = orders.length
    ? `Teles ativas de ${rider.name}. Escolha qual remover.`
    : `${rider.name} não possui tele ativa no momento.`;

  list.innerHTML = orders.length ? orders.map(order => `
    <div class="list-item">
      <div class="item-info">
        <div class="item-icon-avatar bg-yellow"><i data-lucide="route" class="text-black"></i></div>
        <div>
          <h4>${order.id}</h4>
          <p class="text-muted">${order.address}</p>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="removeTeleFromRider('${order.id}', '${rider.id}')">
        <i data-lucide="list-x"></i> Remover
      </button>
    </div>
  `).join('') : `
    <div style="text-align: center; padding: 28px; color: var(--color-text-muted);">
      <i data-lucide="check-circle" style="width: 36px; height: 36px; color: var(--success); margin-bottom: 8px;"></i>
      <p>Nenhuma tele para remover.</p>
    </div>
  `;

  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeRemoveTeleModal(event) {
  const modal = document.getElementById('modal-remove-tele');
  if (event && event.target !== modal) return;
  modal.classList.add('hidden');
}

async function removeTeleFromRider(deliveryId, riderId) {
  const rider = mockData.fleet.find(r => r.id === riderId);
  const order = mockData.clientHistory.find(item => item.id === deliveryId);
  if (!rider || !order) return;

  if (!confirm(`Remover a tele ${deliveryId} de ${rider.name} e devolver para pendentes?`)) return;

  const pendingPayload = {
    id: order.id,
    client: 'Burger do Chef',
    dest_name: order.destName || 'Cliente Express',
    address: order.address,
    dist: order.dist,
    price: order.price,
    payment: 'A combinar',
    cargo: 'Pedido'
  };

  if (supabaseClient) {
    const { error: pendingError } = await supabaseClient
      .from('pending_deliveries')
      .upsert([pendingPayload]);
    if (pendingError) {
      alert('Erro ao devolver a tele para pendentes.');
      return;
    }

    const { error: historyError } = await supabaseClient
      .from('client_history')
      .delete()
      .eq('id', deliveryId);
    if (historyError) {
      alert('Erro ao remover a tele do histórico ativo.');
      return;
    }

    const remainingOrders = getActiveOrdersForRider(rider).filter(item => item.id !== deliveryId);
    if (remainingOrders.length === 0) {
      await supabaseClient
        .from('fleet')
        .update({ status: 'Disponível', status_class: 'status-success', delivery: 'Nenhuma' })
        .eq('id', riderId);
    }
  }

  await fetchPendingDeliveries();
  await fetchFleet();
  await fetchClientHistory();
  renderPendingDeliveries();
  renderActiveDeliveries();
  renderFleetTable();
  renderRiderPayments();

  if (ownerFleetMap) {
    const center = ownerFleetMap.getCenter();
    renderMapMarkers([center.lat, center.lng]);
  }

  closeRemoveTeleModal();
  showToastNotification(`Tele ${deliveryId} removida de ${rider.name}.`);
}

function openRiderActions(riderId) {
  const rider = mockData.fleet.find(r => r.id === riderId);
  if (!rider) return;

  selectedRiderId = riderId;
  document.getElementById('rider-action-name').innerText = rider.name;
  document.getElementById('rider-action-id').innerText = rider.id;
  document.getElementById('rider-action-status').innerText = rider.status;
  document.getElementById('modal-rider-actions').classList.remove('hidden');
  lucide.createIcons();
}

function closeRiderActions(event) {
  const modal = document.getElementById('modal-rider-actions');
  if (event && event.target !== modal) return;
  modal.classList.add('hidden');
}

function locateSelectedRider() {
  if (!selectedRiderId) return;
  selectedMapRiderId = selectedRiderId;
  closeRiderActions();
  switchDashboardTab('owner-fleet-map');
}

function openCredentialsForSelectedRider() {
  if (!selectedRiderId) return;
  closeRiderActions();
  viewRiderCredentials(selectedRiderId);
}

function openRemoveTeleForSelectedRider() {
  if (!selectedRiderId) return;
  closeRiderActions();
  openRemoveTeleModal(selectedRiderId);
}

function openEditSelectedRider() {
  if (!selectedRiderId) return;
  const rider = mockData.fleet.find(r => r.id === selectedRiderId);
  if (!rider) return;

  document.getElementById('edit-rider-id').value = rider.id;
  document.getElementById('edit-rider-name').value = rider.name || '';
  document.getElementById('edit-rider-pin').value = rider.pin || '';
  document.getElementById('edit-rider-vehicle').value = rider.vehicle || '';
  document.getElementById('edit-rider-plate').value = rider.plate || '';
  document.getElementById('edit-rider-status').value = rider.status || 'Disponível';
  document.getElementById('edit-rider-battery').value = rider.battery || '';
  closeRiderActions();
  document.getElementById('modal-edit-rider').classList.remove('hidden');
  lucide.createIcons();
}

function closeEditRider(event) {
  const modal = document.getElementById('modal-edit-rider');
  if (event && event.target !== modal) return;
  modal.classList.add('hidden');
}

function getStatusClass(status) {
  if (status === 'Disponível') return 'status-success';
  if (status === 'Em Descanso') return 'status-neutral';
  return 'status-progress';
}

async function submitEditRider(event) {
  event.preventDefault();
  const riderId = document.getElementById('edit-rider-id').value;
  const status = document.getElementById('edit-rider-status').value;
  const payload = {
    name: document.getElementById('edit-rider-name').value.trim(),
    pin: document.getElementById('edit-rider-pin').value.trim(),
    vehicle: document.getElementById('edit-rider-vehicle').value.trim(),
    plate: document.getElementById('edit-rider-plate').value.trim().toUpperCase(),
    status,
    status_class: getStatusClass(status),
    battery: document.getElementById('edit-rider-battery').value.trim()
  };

  if (supabaseClient) {
    const { error } = await supabaseClient
      .from('fleet')
      .update(payload)
      .eq('id', riderId);
    if (error) {
      alert('Erro ao editar motoboy: ' + error.message);
      return;
    }
  }

  await fetchFleet();
  renderFleetTable();
  closeEditRider();
  showToastNotification('Dados do motoboy atualizados.');
}

/* ================= NOTIFICATION BELL ================= */

function toggleNotifications() {
  const panel = document.getElementById('notification-panel');
  panel.classList.toggle('hidden');
}

function clearNotifications(event) {
  if (event) event.stopPropagation();
  document.getElementById('notification-list').innerHTML = `
    <div style="text-align: center; padding: 32px 16px; color: var(--color-text-muted);">
      <i data-lucide="check-circle" style="width: 36px; height: 36px; color: var(--success); display: inline-block; margin-bottom: 8px;"></i>
      <p style="font-size: 0.9rem;">Nenhuma notificação pendente.</p>
    </div>
  `;
  document.getElementById('bell-badge').style.display = 'none';
  lucide.createIcons();
}

// Close notification panel when clicking outside
document.addEventListener('click', function(e) {
  const panel = document.getElementById('notification-panel');
  const bell  = document.getElementById('notification-bell');
  if (panel && bell && !panel.classList.contains('hidden') && !bell.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

/* ================= MOTOBOY REGISTRATION MODAL ================= */

function openRegisterMotoboy() {
  document.getElementById('modal-register-motoboy').classList.remove('hidden');
  document.getElementById('register-motoboy-form').reset();
  document.getElementById('register-motoboy-error').classList.add('hidden');
  lucide.createIcons();
}

function closeRegisterMotoboy(event) {
  // If called from overlay click, close; if called directly, close
  if (event && event.target !== document.getElementById('modal-register-motoboy')) return;
  document.getElementById('modal-register-motoboy').classList.add('hidden');
}

async function submitRegisterMotoboy(event) {
  event.preventDefault();

  const name     = document.getElementById('mb-name').value.trim();
  const vehicle  = document.getElementById('mb-vehicle').value.trim();
  const plate    = document.getElementById('mb-plate').value.trim().toUpperCase();
  const phone    = document.getElementById('mb-phone').value.trim();
  const battery  = document.getElementById('mb-battery').value;
  const pin      = document.getElementById('mb-pin').value.trim();

  const submitBtn = document.getElementById('register-motoboy-submit-btn');
  submitBtn.disabled = true;
  submitBtn.querySelector('span').innerText = 'Cadastrando...';

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 4) {
    const errorEl = document.getElementById('register-motoboy-error');
    document.getElementById('register-motoboy-error-text').innerText = 'Informe um telefone válido para gerar o ID.';
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.querySelector('span').innerText = 'Cadastrar Motoboy';
    return;
  }

  // ID do motoboy: últimos 4 números do telefone pessoal.
  const newId = '#MB-' + phoneDigits.slice(-4);
  const existingRider = mockData.fleet.find(rider => rider.id === newId);
  if (existingRider) {
    const errorEl = document.getElementById('register-motoboy-error');
    document.getElementById('register-motoboy-error-text').innerText = `Já existe motoboy com o ID ${newId}. Verifique o telefone.`;
    errorEl.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.querySelector('span').innerText = 'Cadastrar Motoboy';
    return;
  }

  const newRider = {
    id: newId,
    name: name,
    vehicle: vehicle,
    plate: plate,
    status: 'Disponível',
    status_class: 'status-success',
    delivery: 'Nenhuma',
    battery: battery + '%',
    rating: 5.00,
    pin: pin
  };

  if (supabaseClient) {
    const { error } = await supabaseClient
      .from('fleet')
      .insert([newRider]);

    if (error) {
      const errorEl = document.getElementById('register-motoboy-error');
      document.getElementById('register-motoboy-error-text').innerText = 'Erro ao salvar: ' + error.message;
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.querySelector('span').innerText = 'Cadastrar Motoboy';
      return;
    }
  } else {
    // Offline fallback: add to local mockData
    mockData.fleet.push({
      id: newId,
      name: name,
      vehicle: vehicle,
      plate: plate,
      status: 'Disponível',
      statusClass: 'status-success',
      delivery: 'Nenhuma',
      battery: battery + '%',
      rating: 5.00
    });
  }

  // Refresh fleet table
  await fetchFleet();
  renderFleetTable();

  // Close registration modal and open credential card
  document.getElementById('modal-register-motoboy').classList.add('hidden');
  openCredentialCard(newId, name, pin);

  submitBtn.disabled = false;
  submitBtn.querySelector('span').innerText = 'Cadastrar Motoboy';
}

// Helper to show modern toast notification
function showToastNotification(message) {
  // Check if toast container exists, otherwise create it
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = 'background: var(--bg-card); border-left: 4px solid var(--primary); color: var(--color-text); padding: 16px 24px; border-radius: var(--border-radius-md); box-shadow: var(--shadow-lg); font-family: var(--font-primary); font-size: 0.9rem; display: flex; align-items: center; gap: 10px; pointer-events: auto; border: 1px solid var(--border-color); animation: toast-in 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);';
  toast.innerHTML = `<i data-lucide="check-circle" style="color: var(--primary); width: 18px; height: 18px;"></i> <span style="font-weight: 500;">${message}</span>`;
  container.appendChild(toast);
  lucide.createIcons();

  // Remove toast after 4 seconds
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function renderClientRatings() {
  const list = document.getElementById('client-ratings-list');
  if (!list) return;

  list.innerHTML = clientRatings.map(item => `
    <div class="list-item">
      <div class="item-info">
        <div class="item-icon-avatar bg-yellow"><i data-lucide="star" class="text-black"></i></div>
        <div>
          <h4>${item.title}</h4>
          <p class="text-muted">${item.comment}</p>
          <p class="text-muted text-xs" style="margin-top: 4px;">${item.date}</p>
        </div>
      </div>
      <div class="courier-rating">
        <i data-lucide="star" class="fill-yellow text-yellow"></i>
        <strong>${item.score}</strong>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function submitClientRating(event) {
  event.preventDefault();
  const score = Number(document.getElementById('rating-score').value);
  const comment = document.getElementById('rating-comment').value.trim();
  clientRatings.unshift({
    score,
    title: score >= 4 ? 'Nova avaliação positiva' : 'Avaliação precisa de atenção',
    comment: comment || 'Sem comentário adicional.',
    date: 'Agora'
  });
  document.getElementById('rating-comment').value = '';
  renderClientRatings();
  showToastNotification('Avaliação enviada.');
}

function openProfileSettings() {
  const profile = mockData.activeProfile;
  const creds = mockData.credentials[profile];
  document.getElementById('profile-name').value = creds.name || '';
  document.getElementById('profile-role').value = creds.role || '';
  document.getElementById('profile-avatar').value = creds.avatar || '';
  document.getElementById('profile-email').value = creds.email || '';
  document.getElementById('profile-partner').value = creds.partner || '';
  updateProfilePreview();
  document.getElementById('modal-profile-settings').classList.remove('hidden');
  lucide.createIcons();
}

function updateProfilePreview() {
  const avatar = document.getElementById('profile-avatar');
  const name = document.getElementById('profile-name');
  const role = document.getElementById('profile-role');
  const avatarPreview = document.getElementById('profile-avatar-preview');
  const namePreview = document.getElementById('profile-preview-name');
  const rolePreview = document.getElementById('profile-preview-role');

  if (avatarPreview) {
    avatarPreview.src = avatar && avatar.value ? avatar.value : document.getElementById('user-avatar').src;
  }
  if (namePreview) namePreview.innerText = name && name.value ? name.value : 'Nome do perfil';
  if (rolePreview) rolePreview.innerText = role && role.value ? role.value : 'Cargo / Função';
}

function closeProfileSettings(event) {
  const modal = document.getElementById('modal-profile-settings');
  if (event && event.target !== modal) return;
  modal.classList.add('hidden');
}

function submitProfileSettings(event) {
  event.preventDefault();
  const profile = mockData.activeProfile;
  const creds = mockData.credentials[profile];
  creds.name = document.getElementById('profile-name').value.trim();
  creds.role = document.getElementById('profile-role').value.trim();
  creds.avatar = document.getElementById('profile-avatar').value.trim() || creds.avatar;
  creds.email = document.getElementById('profile-email').value.trim();
  creds.partner = document.getElementById('profile-partner').value.trim();

  document.getElementById('user-avatar').src = creds.avatar;
  document.getElementById('user-display-name').innerText = creds.name;
  document.getElementById('user-display-sub').innerText = creds.partner
    ? `${creds.role} • Sócio: ${creds.partner}`
    : creds.role;

  closeProfileSettings();
  showToastNotification('Perfil atualizado nesta sessão.');
}

/* ================= PWA INSTALLATION & MODAL CONTROLS ================= */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  console.log('beforeinstallprompt event fired');
});

window.addEventListener('appinstalled', (evt) => {
  console.log('PWA foi instalado com sucesso');
  showToastNotification("Aplicativo instalado com sucesso!");
  deferredPrompt = null;
});

window.installPWA = async function() {
  if (!deferredPrompt) {
    showToastNotification("Instalação direta indisponível. Por favor, instale manualmente usando o guia abaixo.");
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User choice: ${outcome}`);
  deferredPrompt = null;
};

window.showDownloadAppModal = function() {
  const modal = document.getElementById('modal-download-app');
  if (modal) {
    modal.classList.remove('hidden');
    lucide.createIcons();
  }
};

window.closeDownloadApp = function(event) {
  const modal = document.getElementById('modal-download-app');
  if (!modal) return;
  if (event) {
    const isOverlay = event.target === modal;
    const isCloseBtn = event.target.closest('.modal-close-btn');
    if (!isOverlay && !isCloseBtn) return;
  }
  modal.classList.add('hidden');
};
