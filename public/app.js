// ════════════════════════════════════════════════════════
//  RAW (Results Automation Website) — Full SPA
// ════════════════════════════════════════════════════════

const socket = io();
let currentUser = null;
let currentJobId = null; // tracks the active job for progress page
let currentPaymentJobId = null; // tracks active payment job

// ─── Theme & Intro Logic ───
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('raw-theme', theme);
  const icon = document.querySelector('#themeToggle .icon');
  if (icon) icon.textContent = theme === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
}

// ─── Dynamic Nav Renderer ───
function updateNav() {
  const navLinks   = document.getElementById('nav-links');
  const navActions = document.getElementById('nav-actions');
  if (!navLinks || !navActions) return;
  const theme = localStorage.getItem('raw-theme') || 'dark';
  const themeIcon = theme === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
  const themeBtn = `<button class="theme-toggle" id="themeToggle" onclick="toggleTheme()" title="Toggle Theme"><span class="icon">${themeIcon}</span></button>`;

  if (currentUser) {
    // Authenticated nav
    const adminBtn = currentUser.role === 'admin'
      ? `<a onclick="navigate('admin')" style="cursor:pointer;color:var(--color-warning);">\uD83D\uDEE1 Admin</a>`
      : '';
    navLinks.innerHTML = `
      ${adminBtn}
      <a onclick="navigate('portals')" style="cursor:pointer;">🏫 Portals</a>
      <a onclick="navigate('messbill')" style="cursor:pointer;">💰 Mess Bill</a>
    `;
    navActions.innerHTML = `
      <div style="display:flex; align-items:center; gap:0.5rem; margin-right:0.5rem;">
        <a onclick="navigate('profile')" style="font-size:0.85rem; font-weight:600; color:var(--color-primary); opacity:0.9; max-width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; text-decoration:none;" title="Account Settings">👋 ${esc(currentUser.username)}</a>
      </div>
      ${themeBtn}
      <button class="btn btn-outline" onclick="doLogout()">Sign Out</button>
    `;
  } else {
    // Public nav
    navLinks.innerHTML = `
      <a href="#/home">Home</a>
      <a href="#/about">About</a>
      <a href="#/contact">Contact</a>
    `;
    navActions.innerHTML = `
      ${themeBtn}
      <button class="btn btn-outline" onclick="navigate('login')">Sign In</button>
    `;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function handleIntro() {
  const intro = document.getElementById('intro');
  if (!intro || intro.dataset.started) return;
  intro.dataset.started = '1';

  // Show splash for 3 seconds, then 0.8s fade-out
  setTimeout(() => {
    intro.classList.add('fade-out');
    setTimeout(() => intro.remove(), 800);
  }, 3000);
}

// Initialize theme immediately
const savedTheme = localStorage.getItem('raw-theme') || 'dark';
applyTheme(savedTheme);

// Call immediately — scripts are at the bottom of body, DOM is already parsed
handleIntro();

// ─── API Helper ───
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  
  // Detection for Render cold starts
  const wakeupTimeout = setTimeout(() => {
    const loadingEl = document.querySelector('.loading');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <div style="text-align:center;">
          <div class="spinner"></div>
          <div style="margin-top:1rem;">Waking up server...</div>
          <p style="font-size:0.8rem;color:var(--color-muted);margin-top:0.5rem;">(This usually takes 30-60 seconds on Render Free tier)</p>
        </div>
      `;
    }
  }, 1500);

  try {
    const res = await fetch(path, opts);
    clearTimeout(wakeupTimeout);
    return res.json();
  } catch (err) {
    clearTimeout(wakeupTimeout);
    console.error('API Error:', err);
    return { error: 'Network error or server is down' };
  }
}

// ─── Router ───
const routes = {
  home: renderHome,
  login: renderLogin,
  signup: renderSignup,
  dashboard: renderDashboard,
  portals: renderPortals,
  'new-job': renderNewJob,
  history: renderHistory,
  progress: (app) => renderJobProgress(app, currentJobId, {}),
  admin: renderAdminPanel,
  profile: renderProfile,
  about: renderAbout,
  contact: renderContact,
  privacy: renderPrivacy,
  terms: renderTerms,
  disclaimer: renderDisclaimer,
  messbill: renderMessBillDashboard,
  'messbill-new': renderMessBillWizard,
  'messbill-progress': (app) => renderMessBillProgress(app, currentPaymentJobId, {}),
  'messbill-history': renderMessBillHistory,
};

function navigate(page, params = {}) {
  window.location.hash = params.id ? `#/${page}/${params.id}` : `#/${page}`;
}

async function router() {
  const hash = window.location.hash.replace('#/', '') || 'home';
  const [page, id] = hash.split('/');
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading">Loading...</div>';

  // Info pages are public
  const publicPages = ['home', 'login', 'signup', 'about', 'contact', 'privacy', 'terms', 'disclaimer'];

  // Check auth
  if (!publicPages.includes(page)) {
    if (!currentUser) {
      const data = await api('GET', '/api/auth/me');
      if (data.user) {
        currentUser = data.user;
        socket.emit('job:auth');
      } else {
        navigate('login');
        return;
      }
    }
    // Admin route protection
    if (page === 'admin' && currentUser.role !== 'admin') {
      navigate('dashboard');
      return;
    }
  }

  const fn = routes[page];
  if (fn) fn(app, id);
  else navigate('home');

  // Update nav dynamically
  updateNav();

  // Inject Ads if enabled
  injectAds();
}

window.addEventListener('hashchange', router);
window.addEventListener('load', () => {
  router();
  // Early ping to wake up the server (Render free tier)
  fetch('/api/ping').catch(() => {});
});

// ════════════════════════════════════════════════════════
//  HOME / LANDING PAGE
// ════════════════════════════════════════════════════════
function renderHome(app) {
  // If logged in redirect to dashboard directly
  if (currentUser) { navigate('dashboard'); return; }
  app.innerHTML = `
  <div class="fade-in">
    <section class="hero">
      <h1>Automate Your College Results Portfolio</h1>
      <p>RAW (Results Automation Website) is the ultimate multi-college platform for students and faculty to scrape, track, and export academic results with 99.9% accuracy.</p>
      <div class="hero-btns">
        <button class="btn btn-lg" onclick="navigate('signup')">Get Started Free</button>
        <button class="btn btn-lg btn-outline" onclick="document.getElementById('how-it-works').scrollIntoView({behavior:'smooth'})">See How it Works</button>
      </div>
    </section>

    <section class="features-grid">
      <div class="feature-card glass">
        <h3>⚡ Real-time Automation</h3>
        <p>Bypass the tedious manual entry. RAW automatically navigates portal logins and retrieves marks sheets in seconds.</p>
      </div>
      <div class="feature-card glass">
        <h3>📊 Excel Exports</h3>
        <p>Generate professionally formatted Excel workbooks with automated CGPA calculation and backlog tracking.</p>
      </div>
      <div class="feature-card glass">
        <h3>🛡 Secure Processing</h3>
        <p>We prioritize your privacy. Passwords are never stored permanently, and data is processed through secure, encrypted sessions.</p>
      </div>
    </section>

    <section id="how-it-works" class="how-it-works">
      <h2 class="text-center" style="font-size:2rem; margin-bottom:1rem;">How It Works</h2>
      <p class="text-center" style="color:var(--color-muted); max-width:600px; margin:0 auto 3rem;">Four simple steps to automate your academic data management.</p>
      
      <div class="steps-container">
        <div class="step">
          <div class="step-num">01</div>
          <h4>Link Portal</h4>
          <p style="color:var(--color-muted); font-size:0.9rem;">Choose from our list of supported college portals or add your own custom login selectors.</p>
        </div>
        <div class="step">
          <div class="step-num">02</div>
          <h4>Input Data</h4>
          <p style="color:var(--color-muted); font-size:0.9rem;">Paste a list of roll numbers. You can also include student names for better reporting.</p>
        </div>
        <div class="step">
          <div class="step-num">03</div>
          <h4>Run Scraper</h4>
          <p style="color:var(--color-muted); font-size:0.9rem;">Watch in real-time as RAW navigates the portal, bypasses captchas, and collects detailed marks.</p>
        </div>
        <div class="step">
          <div class="step-num">04</div>
          <h4>Export Data</h4>
          <p style="color:var(--color-muted); font-size:0.9rem;">One-click download of a complete Excel report containing all student results and statistics.</p>
        </div>
      </div>
    </section>

    <div class="ad-slot banner"></div>

    <section class="faq-section">
      <h2 class="text-center" style="font-size:2rem; margin-bottom:3rem;">Frequently Asked Questions</h2>
      
      <div class="faq-item">
        <h4>Is RAW officially affiliated with my university?</h4>
        <p>No. RAW is an independent automation tool designed to help students and institutions manage their data more efficiently. We are not officially affiliated with JNTU or any other university.</p>
      </div>
      
      <div class="faq-item">
        <h4>Can I use RAW for any college?</h4>
        <p>RAW supports any result portal that uses standard web forms. If your college is not listed, you can easily add it by providing the login and marksheet URL selectors in the "Portals" section.</p>
      </div>
      
      <div class="faq-item">
        <h4>Is my login information safe?</h4>
        <p>Yes. RAW processes logins in real-time during the scraping session. We do not store student or portal passwords in our database. Your privacy and security are our top priorities.</p>
      </div>

      <div class="faq-item">
        <h4>What happens if the portal is slow or down?</h4>
        <p>RAW includes built-in retry logic and smart-wait features. If a portal is unresponsive, the scraper will pause and retry automatically to ensure no data is missed.</p>
      </div>
    </section>

    <div class="text-center" style="padding:4rem 0;">
      <h3 style="margin-bottom:1.5rem;">Ready to automate your results?</h3>
      <button class="btn btn-lg" onclick="navigate('signup')">Create Account Now</button>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════
//  LOGIN PAGE
// ════════════════════════════════════════════════════════
function renderLogin(app) {
  app.innerHTML = `
  <div class="auth-wrap fade-in">
    <div class="auth-card glass">
      <div class="auth-logo">🎓</div>
      <h2 class="auth-title">Welcome Back</h2>
      <p class="auth-sub">Sign in to your RAW account</p>
      <div id="loginMsg" class="msg"></div>
      <div class="form-group">
        <label>Email</label>
        <input id="loginEmail" type="email" class="input" placeholder="you@college.edu" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input id="loginPass" type="password" class="input" placeholder="••••••••" />
      </div>
      <button class="btn btn-full" onclick="doLogin()">Sign In</button>
      <p class="auth-switch">Don't have an account? <a href="#/signup">Sign up</a></p>
    </div>
  </div>`;
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  const msg   = document.getElementById('loginMsg');
  if (!email || !pass) { showMsg(msg, 'Please fill all fields', 'error'); return; }
  showMsg(msg, 'Signing in...', 'info');
  const data = await api('POST', '/api/auth/login', { email, password: pass });
  if (data.error) { showMsg(msg, data.error, 'error'); return; }
  currentUser = data.user;
  socket.emit('job:auth'); // join the user room on the socket
  navigate('dashboard');
}

// ════════════════════════════════════════════════════════
//  SIGNUP PAGE
// ════════════════════════════════════════════════════════
function renderSignup(app) {
  app.innerHTML = `
  <div class="auth-wrap fade-in">
    <div class="auth-card glass">
      <div class="auth-logo">🎓</div>
      <h2 class="auth-title">Create Account</h2>
      <p class="auth-sub">Join the RAW (Results Automation Website)</p>
      <div id="signupMsg" class="msg"></div>
      <div class="form-group">
        <label>Username</label>
        <input id="signupUser" type="text" class="input" placeholder="Your name" />
      </div>
      <div class="form-group">
        <label>Email</label>
        <input id="signupEmail" type="email" class="input" placeholder="you@college.edu" />
      </div>
      <div class="form-group">
        <label>Password</label>
        <input id="signupPass" type="password" class="input" placeholder="Min 4 characters" />
      </div>
      <button class="btn btn-full" onclick="doSignup()">Create Account</button>
      <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>
    </div>
  </div>`;
}

async function doSignup() {
  const username = document.getElementById('signupUser').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPass').value;
  const msg      = document.getElementById('signupMsg');
  if (!username || !email || !password) { showMsg(msg, 'All fields required', 'error'); return; }
  showMsg(msg, 'Creating account...', 'info');
  const data = await api('POST', '/api/auth/signup', { username, email, password });
  if (data.error) { showMsg(msg, data.error, 'error'); return; }
  currentUser = data.user;
  socket.emit('job:auth'); // join the user room on the socket
  navigate('dashboard');
}

// ════════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ════════════════════════════════════════════════════════
async function renderDashboard(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="dash-header">
      <div>
        <h2>Welcome, ${currentUser.username} 👋</h2>
        <p style="color:var(--color-muted)">RAW — Results Automation Website</p>
      </div>
      <div class="dash-actions">
        <button class="btn" onclick="navigate('new-job')">🚀 New Job</button>
        <button class="btn btn-outline" onclick="navigate('history')">📂 History</button>
      </div>
    </div>

    <div class="ad-slot banner" id="ad-top"></div>

    <div class="stats-grid">
      <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="statJobs">—</h3><p>Total Jobs</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🏫</div><div class="stat-info"><h3 id="statPortals">—</h3><p>Portals</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🎓</div><div class="stat-info"><h3 id="statStudents">—</h3><p>Students Scraped</p></div></div>
    </div>

    <div class="section-title">Recent Jobs</div>
    <div id="recentJobs" class="glass" style="min-height:80px;padding:1rem;"><p style="color:var(--color-muted)">Loading...</p></div>

    <div style="display:flex;gap:1rem;margin-top:1.5rem;">
      <button class="btn btn-full btn-lg" onclick="navigate('new-job')">🚀 Start New Job</button>
      <button class="btn btn-full btn-lg btn-outline" onclick="navigate('history')">📂 View History</button>
    </div>
  </div>`;

  const [jobsData, portalsData] = await Promise.all([
    api('GET', '/api/jobs'),
    api('GET', '/api/portals'),
  ]);

  const jobs    = jobsData.jobs    || [];
  const portals = portalsData.portals || [];
  const totalStudents = jobs.reduce((s, j) => s + (j.total_students || 0), 0);

  document.getElementById('statJobs').textContent    = jobs.length;
  document.getElementById('statPortals').textContent = portals.length;
  document.getElementById('statStudents').textContent = totalStudents;

  // Check for any running/pending jobs — show reconnect button
  const pendingJob = jobs.find(j => j.status === 'pending');
  if (pendingJob) {
    const banner = document.createElement('div');
    banner.className = 'glass';
    banner.style.cssText = 'padding:1rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;border:1px solid var(--color-primary);';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.8rem;">
        <span style="font-size:1.5rem;">⚡</span>
        <div>
          <strong style="color:var(--color-primary);">Scraping in progress</strong>
          <div style="color:var(--color-muted);font-size:0.85rem;">${esc(pendingJob.portal_name)} — ${pendingJob.completed_students}/${pendingJob.total_students} done</div>
        </div>
      </div>
      <button class="btn" onclick="currentJobId=${pendingJob.id}; navigate('progress')">📡 View Progress</button>
    `;
    document.getElementById('recentJobs').parentElement.insertBefore(banner, document.getElementById('recentJobs'));
  }

  const recentDiv = document.getElementById('recentJobs');
  if (!jobs.length) {
    recentDiv.innerHTML = `<p style="color:var(--color-muted);text-align:center;padding:1rem;">No jobs yet. <a href="#/new-job">Create one now.</a></p>`;
  } else {
    recentDiv.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>College</th><th>Semester</th><th>Students</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${jobs.slice(0,5).map(j => `
        <tr>
          <td>${fmtDate(j.created_at)}</td>
          <td>${esc(j.portal_name || 'Unknown')}</td>
          <td>${esc(j.semester || '—')}</td>
          <td>${j.total_students}</td>
          <td><span class="badge ${j.status === 'completed' ? 'success' : j.status === 'failed' ? 'error' : 'warning'}">${j.status}</span></td>
          <td>${j.status === 'completed' ? `<a href="/api/jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }
}

async function doLogout() {
  await api('POST', '/api/auth/logout');
  currentUser = null;
  navigate('login');
}

// ════════════════════════════════════════════════════════
//  PORTALS PAGE
// ════════════════════════════════════════════════════════
async function renderPortals(app) {
  // Reset the body-level portal modal (defined in index.html)
  const pm = document.getElementById('portalModal');
  if (pm) pm.style.display = 'none';

  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h2>🏫 College Portals</h2>
        <p style="color:var(--color-muted)">Manage your result portals</p>
      </div>
      <div>
        <button class="btn btn-outline" onclick="navigate('dashboard')">← Back</button>
        <button class="btn" onclick="showAddPortal()">+ Add Portal</button>
      </div>
    </div>
    <div id="portalList" class="fade-in"><p style="color:var(--color-muted)">Loading...</p></div>
  </div>`;

  loadPortals();
}

async function loadPortals() {
  const data = await api('GET', '/api/portals');
  const list = document.getElementById('portalList');
  const portals = data.portals || [];
  if (!portals.length) {
    list.innerHTML = `<div class="glass" style="text-align:center;padding:2rem;"><p style="color:var(--color-muted)">No portals yet. Add your first college portal.</p></div>`;
  } else {
    list.innerHTML = portals.map(p => `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3>${esc(p.name)}</h3>
          <small style="color:var(--color-muted)">${esc(p.login_url)}</small><br/>
          <div style="margin-top:0.5rem;">${(p.semesters || []).map(s => `<span class="sem-chip">${s}</span>`).join('')}</div>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn btn-outline" onclick="showEditPortal(${p.id})">Edit</button>
          <button class="btn btn-outline" style="color:var(--color-error);border-color:var(--color-error)" onclick="deletePortal(${p.id})">Delete</button>
        </div>
      </div>
    </div>`).join('');
  }
}

function portalFormHTML(p = {}) {
  const sems = ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
  const selected = p.semesters || sems;
  return `
  <div class="portal-grid-editor">
    <div class="portal-form-section">
      <h4 style="margin-bottom:1rem; color:var(--color-primary);">Basic Info</h4>
      <div class="form-group"><label>College Name*</label><input id="pName" class="input" value="${esc(p.name||'')}" placeholder="e.g. KIET Group of Institutions"/></div>
      <div class="form-group"><label>Login URL*</label><input id="pLoginUrl" class="input" value="${esc(p.login_url||'')}" placeholder="https://..."/></div>
      <div class="form-group"><label>Marksheet URL*</label><input id="pMarkUrl" class="input" value="${esc(p.marksheet_url||'')}" placeholder="https://..."/></div>
      <div class="form-group"><label>Logout URL</label><input id="pLogoutUrl" class="input" value="${esc(p.logout_url||'')}" placeholder="https://..."/></div>
    </div>
    <div class="portal-form-section">
      <h4 style="margin-bottom:1rem; color:var(--color-primary);">Selectors & Config</h4>
      <div class="form-group"><label>Username Field Selector</label><input id="pUserSel" class="input" value="${esc(p.username_selector||'#MainContent_UserName')}"/></div>
      <div class="form-group"><label>Password Field Selector</label><input id="pPassSel" class="input" value="${esc(p.password_selector||'#MainContent_Password')}"/></div>
      <div class="form-group"><label>Submit Button Selector</label><input id="pSubmitSel" class="input" value="${esc(p.submit_selector||'input[type=\"submit\"]')}"/></div>
      <div class="form-group">
        <label>Default Password <small style="color:var(--color-muted)">(Optional)</small></label>
        <input id="pDefaultPass" class="input" value="${esc(p.default_password||'')}"/>
      </div>
    </div>
  </div>
  <div class="portal-form-section" style="margin-top:1rem;">
    <h4 style="margin-bottom:0.75rem; color:var(--color-primary);">Semesters Available</h4>
    <div style="display:flex;flex-wrap:wrap;gap:0.8rem;">
      ${sems.map(s => `<label style="display:flex;align-items:center;gap:0.4rem; cursor:pointer;">
        <input type="checkbox" id="sem_${s}" value="${s}" ${selected.includes(s)?'checked':''}> <span class="sem-chip">${s}</span></label>`).join('')}
    </div>
  </div>`;
}

function getPortalFormData() {
  const sems = ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'].filter(s => {
    const el = document.getElementById(`sem_${s}`);
    return el && el.checked;
  });
  return {
    name: document.getElementById('pName').value.trim(),
    login_url: document.getElementById('pLoginUrl').value.trim(),
    marksheet_url: document.getElementById('pMarkUrl').value.trim(),
    logout_url: document.getElementById('pLogoutUrl').value.trim(),
    username_selector: document.getElementById('pUserSel').value.trim(),
    password_selector: document.getElementById('pPassSel').value.trim(),
    submit_selector: document.getElementById('pSubmitSel').value.trim(),
    default_password: document.getElementById('pDefaultPass').value.trim(),
    semesters: sems,
  };
}

function showModal(title, body, onSave) {
  const modal = document.getElementById('portalModal');
  modal.style.display = 'flex';
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };
  modal.innerHTML = `
  <div class="modal-box glass scale-in" onclick="event.stopPropagation()">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h2 style="margin:0; color:var(--color-primary);">${title}</h2>
      <button onclick="closeModal()" style="background:none; border:none; color:var(--color-muted); font-size:1.5rem; cursor:pointer;">&times;</button>
    </div>
    <div id="modalMsg" class="msg"></div>
    ${body}
    <div style="display:flex;gap:1rem;margin-top:1.5rem; justify-content:flex-end;">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn" style="min-width:120px;" onclick="${onSave}">Save Portal</button>
    </div>
  </div>`;
}

function closeModal() {
  const modal = document.getElementById('portalModal');
  if (modal) modal.style.display = 'none';
}

function showAddPortal() {
  showModal('Add New Portal', portalFormHTML(), 'saveNewPortal()');
}

async function saveNewPortal() {
  const data = getPortalFormData();
  const msg  = document.getElementById('modalMsg');
  if (!data.name || !data.login_url || !data.marksheet_url) { showMsg(msg,'Name, Login & Marksheet URL required','error'); return; }
  const res = await api('POST', '/api/portals', data);
  if (res.error) { showMsg(msg, res.error, 'error'); return; }
  closeModal();
  loadPortals();
}

async function showEditPortal(id) {
  const data = await api('GET', '/api/portals');
  const portal = (data.portals || []).find(p => p.id === id);
  if (!portal) return;
  showModal('Edit Portal', portalFormHTML(portal), `saveEditPortal(${id})`);
}

async function saveEditPortal(id) {
  const data = getPortalFormData();
  const msg  = document.getElementById('modalMsg');
  if (!data.name || !data.login_url || !data.marksheet_url) { showMsg(msg,'Name, Login & Marksheet URL required','error'); return; }
  const res = await api('PUT', `/api/portals/${id}`, data);
  if (res.error) { showMsg(msg, res.error, 'error'); return; }
  closeModal();
  loadPortals();
}

async function deletePortal(id) {
  if (!confirm('Delete this portal?')) return;
  await api('DELETE', `/api/portals/${id}`);
  loadPortals();
}

// ════════════════════════════════════════════════════════
//  NEW JOB WIZARD (4 Steps)
// ════════════════════════════════════════════════════════
const wizard = { step: 1, portal: null, semester: null, students: [], headless: true };

async function renderNewJob(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>🚀 New Scraping Job</h2><p style="color:var(--color-muted)">Follow the steps below</p></div>
      <button class="btn btn-outline" onclick="navigate('dashboard')">← Back</button>
    </div>

    <div class="wizard-steps">
      <div class="wizard-step" id="wStep1">1. College</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="wStep2">2. Semester</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="wStep3">3. Students</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="wStep4">4. Review</div>
    </div>

    <div id="wizardBody" class="glass" style="padding:1.5rem;"></div>
  </div>`;

  wizard.step = 1;
  wizard.portal = null;
  wizard.semester = null;
  wizard.students = [];
  renderWizardStep();
}

function updateWizardSteps() {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`wStep${i}`);
    if (!el) return;
    el.className = 'wizard-step' + (i < wizard.step ? ' done' : i === wizard.step ? ' active' : '');
  }
}

async function renderWizardStep() {
  updateWizardSteps();
  const body = document.getElementById('wizardBody');
  if (wizard.step === 1) await renderWizardStep1(body);
  else if (wizard.step === 2) renderWizardStep2(body);
  else if (wizard.step === 3) renderWizardStep3(body);
  else if (wizard.step === 4) renderWizardStep4(body);
}

async function renderWizardStep1(body) {
  const data = await api('GET', '/api/portals');
  const portals = data.portals || [];
  body.innerHTML = `
  <h3 style="margin-bottom:1rem;">Select College Portal</h3>
  <div id="stepMsg" class="msg"></div>
  ${portals.length ? portals.map(p => `
    <div class="card portal-pick ${wizard.portal && wizard.portal.id === p.id ? 'picked' : ''}" onclick="pickPortal(${p.id})" id="ppCard_${p.id}" style="cursor:pointer;border:2px solid transparent;">
      <div style="display:flex;align-items:center;gap:1rem;">
        <span style="font-size:2rem;">🏫</span>
        <div>
          <h3 style="margin:0;">${esc(p.name)}</h3>
          <small style="color:var(--color-muted)">${esc(p.login_url)}</small>
        </div>
      </div>
    </div>`).join('') : `<p style='color:var(--color-muted)'>No portals yet. <a href="#/portals">Add one first.</a></p>`}
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn" onclick="wizardNext1()" ${!portals.length?'disabled':''}>Next →</button>
  </div>`;
  if (wizard.portal) pickPortal(wizard.portal.id, false);
  window._portals = portals;
}

function pickPortal(id, update=true) {
  window._portals.forEach(p => {
    const card = document.getElementById(`ppCard_${p.id}`);
    if (card) card.style.borderColor = p.id === id ? 'var(--color-primary)' : 'transparent';
  });
  if (update) wizard.portal = window._portals.find(p => p.id === id);
}

function wizardNext1() {
  const msg = document.getElementById('stepMsg');
  if (!wizard.portal) { showMsg(msg, 'Please select a portal', 'error'); return; }
  wizard.step = 2;
  renderWizardStep();
}

function renderWizardStep2(body) {
  const sems = wizard.portal.semesters || ['1-1','1-2','2-1','2-2','3-1','3-2','4-1','4-2'];
  body.innerHTML = `
  <h3 style="margin-bottom:1rem;">Select Semester</h3>
  <div id="stepMsg" class="msg"></div>
  <p style="color:var(--color-muted);margin-bottom:1rem;">College: <strong>${esc(wizard.portal.name)}</strong></p>
  <div class="sem-grid">
    ${sems.map(s => `<button class="sem-btn ${wizard.semester===s?'active':''}" onclick="pickSem('${s}')" id="semBtn_${s}">${s}</button>`).join('')}
  </div>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="wizardBack()">← Back</button>
    <button class="btn" onclick="wizardNext2()">Next →</button>
  </div>`;
}

function pickSem(sem) {
  const old = document.querySelector('.sem-btn.active');
  if (old) old.classList.remove('active');
  const btn = document.getElementById(`semBtn_${sem}`);
  if (btn) btn.classList.add('active');
  wizard.semester = sem;
}

function wizardNext2() {
  const msg = document.getElementById('stepMsg');
  if (!wizard.semester) { showMsg(msg, 'Please select a semester', 'error'); return; }
  wizard.step = 3;
  renderWizardStep();
}

function renderWizardStep3(body) {
  body.innerHTML = `
  <h3 style="margin-bottom:1rem;">Enter Students</h3>
  <div id="stepMsg" class="msg"></div>
  <p style="color:var(--color-muted);margin-bottom:0.5rem;">Paste roll numbers and names (one student per line).<br/>
  Format: <code style="background:rgba(255,255,255,0.06);padding:0.1rem 0.4rem;border-radius:4px;">ROLLNO NAME</code> (spaces, tabs, or commas allowed)</p>
  <textarea id="studentsInput" class="input" rows="12" style="font-family:var(--font-mono);font-size:0.85rem;resize:vertical;"
  placeholder="256Q1A4234,MANTENA VENKATA ESWANTH VARMA
256Q1A4235,JAMMULA RAGHURAM
25B21A4279,BONU KARTHIK">${wizard.students.length ? wizard.students.map(s=>s.rollNo+(s.name?','+s.name:'')).join('\n') : ''}</textarea>
  <p id="studCount" style="color:var(--color-muted);font-size:0.85rem;margin-top:0.5rem;">0 students entered</p>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="wizardBack()">← Back</button>
    <button class="btn" onclick="wizardNext3()">Next →</button>
  </div>`;

  const ta = document.getElementById('studentsInput');
  ta.addEventListener('input', () => {
    const lines = ta.value.split('\n').filter(l=>l.trim());
    document.getElementById('studCount').textContent = `${lines.length} student${lines.length===1?'':'s'} entered`;
  });
  if (wizard.students.length) ta.dispatchEvent(new Event('input'));
}

function wizardNext3() {
  const raw = document.getElementById('studentsInput').value.trim();
  const msg = document.getElementById('stepMsg');
  if (!raw) { showMsg(msg, 'Please enter at least one student', 'error'); return; }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const students = [];
  for (const line of lines) {
    // Skip JSON-looking lines or obviously invalid entries
    if (line.startsWith('{') || line.startsWith('}') || line.startsWith('[') || line.startsWith('"') || !line.match(/[A-Z0-9]{5,}/i)) continue;
    // Smart parsing for separators: tab, pipe, comma, or just spaces
    let rollNo = '';
    let name = '';

    if (line.includes('\t')) {
      const parts = line.split('\t');
      rollNo = parts[0].trim();
      name = parts.slice(1).join(' ').trim() || rollNo;
    } else if (line.includes(',') || line.includes('|')) {
      const sep = line.includes('|') ? '|' : ',';
      const parts = line.split(sep);
      rollNo = parts[0].trim();
      name = parts.slice(1).join(sep).trim() || rollNo;
    } else {
      // Space separated fallback (e.g. "25B21A4294 DAKAMARI VIVEK")
      const firstSpace = line.indexOf(' ');
      if (firstSpace > 0) {
        rollNo = line.substring(0, firstSpace).trim();
        name = line.substring(firstSpace + 1).trim() || rollNo;
      } else {
        rollNo = line.trim();
        name = rollNo;
      }
    }

    if (rollNo) students.push({ rollNo, name });
  }

  if (!students.length) { showMsg(msg, 'No valid students found. Format: ROLLNO | NAME or ROLLNO,NAME', 'error'); return; }
  wizard.students = students;
  wizard.step = 4;
  renderWizardStep();
}

function renderWizardStep4(body) {
  body.innerHTML = `
  <h3 style="margin-bottom:1rem;">Review & Start</h3>
  <div class="review-grid">
    <div class="review-item">
      <div class="review-label">College</div>
      <div class="review-value">${esc(wizard.portal.name)}</div>
    </div>
    <div class="review-item">
      <div class="review-label">Semester</div>
      <div class="review-value">${esc(wizard.semester)}</div>
    </div>
    <div class="review-item">
      <div class="review-label">Students</div>
      <div class="review-value">${wizard.students.length} entered</div>
    </div>
    <div class="review-item">
      <div class="review-label">Browser Mode</div>
      <div class="review-value">
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;color:var(--color-text);">
          <input type="checkbox" id="headlessToggle" ${wizard.headless?'checked':''} onchange="wizard.headless=this.checked;"> Run in background (headless)
        </label>
      </div>
    </div>
  </div>
  <div class="glass" style="margin-top:1rem;padding:1rem;max-height:150px;overflow-y:auto;">
    <small style="color:var(--color-muted)">Students preview:</small>
    ${wizard.students.slice(0,10).map(s=>`<div style="font-size:0.85rem;color:var(--color-text);">${esc(s.rollNo)} — ${esc(s.name)}</div>`).join('')}
    ${wizard.students.length > 10 ? `<div style="color:var(--color-muted);font-size:0.85rem;">...and ${wizard.students.length-10} more</div>` : ''}
  </div>
  <div id="stepMsg" class="msg"></div>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="wizardBack()">← Back</button>
    <button class="btn btn-lg" id="startBtn" onclick="startJob()">🚀 Start Scraping</button>
  </div>`;
}

async function startJob() {
  const msg = document.getElementById('stepMsg');
  const btn = document.getElementById('startBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Creating job...';
  showMsg(msg, 'Setting up job...', 'info');

  // Re-authenticate socket so it's in the right room
  socket.emit('job:auth');

  console.log('🚀 Starting job with data:', {
    portal_id: wizard.portal.id,
    semester: wizard.semester,
    students_count: wizard.students.length,
    headless: wizard.headless
  });

  const res = await api('POST', '/api/jobs', {
    portal_id: wizard.portal.id,
    semester: wizard.semester,
    students: wizard.students,
    headless: wizard.headless,
  });
  if (res.error) { showMsg(msg, res.error, 'error'); btn.disabled = false; btn.textContent = '🚀 Start Scraping'; return; }

  // Navigate to progress page directly
  currentJobId = res.jobId;
  window.location.hash = '#/progress';
}

function wizardBack() {
  wizard.step = Math.max(1, wizard.step - 1);
  renderWizardStep();
}

// ════════════════════════════════════════════════════════
//  JOB PROGRESS PAGE (live, with pause/resume)
// ════════════════════════════════════════════════════════
function renderJobProgress(app, jobId, jobMeta) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>⚡ Live Scraping Progress</h2><p style="color:var(--color-muted)">Scraping Job</p></div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" id="pauseBtn" onclick="togglePause()" style="display:none;">⏸ Pause</button>
        <button class="btn btn-outline" onclick="navigate('history')">📂 History</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card glass"><div class="stat-icon">🎓</div><div class="stat-info"><h3 id="pTotal">—</h3><p>Total</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">✅</div><div class="stat-info"><h3 id="pDone">0</h3><p>Done</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">⏱</div><div class="stat-info"><h3 id="pETA">—</h3><p>ETA</p></div></div>
    </div>

    <div class="glass" style="padding:1.5rem;margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
        <span id="pPhase" style="font-weight:600;color:var(--color-primary)">Starting...</span>
        <span id="pPct">0%</span>
      </div>
      <div class="progress-bar"><div class="fill" id="pBar" style="width:0%"></div></div>
      <p id="pCurrent" style="margin-top:0.5rem;font-size:0.85rem;color:var(--color-muted)">Waiting...</p>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div class="glass" style="padding:1rem;">
        <h4 style="margin-bottom:0.5rem;">Live Results</h4>
        <div style="overflow-y:auto;max-height:280px;">
          <table>
            <thead><tr><th>#</th><th>Roll No</th><th>CGPA</th><th>Status</th></tr></thead>
            <tbody id="liveResults"></tbody>
          </table>
        </div>
      </div>
      <div class="glass" style="padding:1rem;">
        <h4 style="margin-bottom:0.5rem;">Console Log</h4>
        <div id="liveLog" style="overflow-y:auto;max-height:280px;font-family:var(--font-mono);font-size:0.78rem;color:var(--color-muted);"></div>
      </div>
    </div>

    <div id="completeSummary" style="display:none;margin-top:1rem;" class="glass">
      <h3 style="color:var(--color-success);">✅ Scraping Complete!</h3>
      <div class="stats-grid" style="margin-top:1rem;">
        <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="sTotal">—</h3><p>Total</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">✅</div><div class="stat-info"><h3 id="sPass">—</h3><p>All Clear</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">🔴</div><div class="stat-info"><h3 id="sBlog">—</h3><p>Backlogs</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">❌</div><div class="stat-info"><h3 id="sErr">—</h3><p>Errors</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">⏱</div><div class="stat-info"><h3 id="sElapsed">—</h3><p>Time Taken</p></div></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:1rem;">
        <a id="dlBtn" href="#" class="btn" style="display:none;">⬇ Download Excel</a>
        <button class="btn btn-outline" onclick="navigate('dashboard')">← Dashboard</button>
      </div>
    </div>
  </div>`;

  document.getElementById('pTotal').textContent = jobMeta?.total || '?';

  // Track pause state locally
  window._jobPaused = false;

  // Clear old listeners to prevent duplicates on re-render
  socket.off('job:started'); socket.off('job:progress');
  socket.off('job:student-done'); socket.off('job:log');
  socket.off('job:complete'); socket.off('job:error'); socket.off('job:auth-ok');
  socket.off('job:paused'); socket.off('job:resumed'); socket.off('job:reconnect-data');

  function showPauseBtn(paused) {
    const btn = document.getElementById('pauseBtn');
    if (!btn) return;
    btn.style.display = '';
    window._jobPaused = paused;
    btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
    btn.style.color = paused ? 'var(--color-success)' : '';
    btn.style.borderColor = paused ? 'var(--color-success)' : '';
  }

  function doStartJob() { socket.emit('job:start', { jobId }); }

  // Step 1: auth socket, then try reconnect or start
  socket.once('job:auth-ok', () => {
    console.log('Socket auth OK, trying reconnect or start');
    socket.emit('job:reconnect', { jobId });
  });
  socket.emit('job:auth');

  // Handle reconnect data (if job is already running in background)
  socket.once('job:reconnect-data', (d) => {
    if (d.running) {
      console.log('Reconnected to running job, restoring state...', d.total);
      
      // Update totals
      if (d.total) { document.getElementById('pTotal').textContent = d.total; }
      showPauseBtn(d.paused);

      // Restore cached results
      const tbody = document.getElementById('liveResults');
      tbody.innerHTML = ''; // Prevent duplicates
      (d.results || []).forEach(r => {
        const sc = r.status === 'SUCCESS' && r.backlogCount === 0 ? 'success' : r.status === 'SUCCESS' ? 'warning' : 'error';
        const st = r.status === 'SUCCESS' && r.backlogCount === 0 ? '✅ Pass' : r.status === 'SUCCESS' ? `🔴 ${r.backlogCount} BL` : '❌ Err';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${r.index+1}</td><td><strong>${esc(r.rollNo)}</strong></td><td>${r.sgpa||'—'}</td><td><span class="badge ${sc}">${st}</span></td>`;
        tbody.insertBefore(tr, tbody.firstChild);
      });
      document.getElementById('pDone').textContent = (d.results || []).length;

      // Restore cached logs
      const log = document.getElementById('liveLog');
      log.innerHTML = ''; // Prevent duplicates
      (d.logs || []).forEach(l => {
        const div = document.createElement('div');
        div.textContent = `[${new Date(l.time).toLocaleTimeString()}] ${l.message}`;
        log.appendChild(div);
      });
      log.scrollTop = log.scrollHeight;

      if (d.paused) {
        document.getElementById('pPhase').textContent = '⏸ Paused';
      }

      // Important: Disable the fallback timer to avoid accidentally starting the job!
      window._jobReconnectSuccess = true;
    } else {
      // Job not running, start it fresh
      window._jobReconnectSuccess = true;
      doStartJob();
    }
  });

  // Fallback: if reconnect never fires (e.g. server delay), start after 2s
  setTimeout(() => {
    if (!window._jobReconnectSuccess) {
      console.log('Fallback: starting job directly since no reconnect data was received.');
      doStartJob();
    }
  }, 2000);

  // Pause/resume confirmations
  socket.on('job:paused', d => { if (d.jobId == jobId) showPauseBtn(true); });
  socket.on('job:resumed', d => { if (d.jobId == jobId) showPauseBtn(false); });

  socket.on('job:started', d => {
    if (d.jobId == jobId) {
      document.getElementById('pTotal').textContent = d.total;
      showPauseBtn(false);
    }
  });
  socket.on('job:progress', d => {
    if (d.jobId != jobId) return;
    const phases = { launching: '🚀 Launching', running: '⚡ Scraping', paused: '⏸ Paused', generating: '📊 Building Excel', done: '✅ Complete' };
    document.getElementById('pPhase').textContent = phases[d.phase] || d.phase;
    document.getElementById('pPct').textContent   = d.percentage + '%';
    document.getElementById('pBar').style.width   = d.percentage + '%';
    // Only update ETA when explicitly provided — avoids flickering back to '—'
    if (d.eta !== undefined) document.getElementById('pETA').textContent = d.eta;
    document.getElementById('pDone').textContent  = d.current || 0;
    document.getElementById('pTotal').textContent = d.total || '?';
    if (d.currentStudent) {
      document.getElementById('pCurrent').textContent = '▶ ' + d.currentStudent.rollNo + ' — ' + (d.currentStudent.name || '');
    }
    if (d.phase === 'paused') {
      document.getElementById('pCurrent').textContent = '⏸ Paused — click Resume to continue';
    }
  });
  socket.on('job:student-done', d => {
    if (d.jobId != jobId) return;
    const tbody = document.getElementById('liveResults');
    const sc = d.status === 'SUCCESS' && d.backlogCount === 0 ? 'success' : d.status === 'SUCCESS' ? 'warning' : 'error';
    const st = d.status === 'SUCCESS' && d.backlogCount === 0 ? '✅ Pass' : d.status === 'SUCCESS' ? `🔴 ${d.backlogCount} BL` : '❌ Err';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${d.index+1}</td><td><strong>${esc(d.rollNo)}</strong></td><td>${d.sgpa||'—'}</td><td><span class="badge ${sc}">${st}</span></td>`;
    tbody.insertBefore(tr, tbody.firstChild);
    document.getElementById('pDone').textContent = d.index + 1;
  });
  socket.on('job:log', d => {
    if (d.jobId != jobId) return;
    const log = document.getElementById('liveLog');
    const div = document.createElement('div');
    div.textContent = `[${new Date(d.time).toLocaleTimeString()}] ${d.message}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  });
  socket.on('job:complete', d => {
    if (d.jobId != jobId) return;
    // Hide pause button
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) pauseBtn.style.display = 'none';

    // Force progress UI to 100%
    document.getElementById('pPhase').textContent = '✅ Complete';
    document.getElementById('pPct').textContent   = '100%';
    document.getElementById('pBar').style.width   = '100%';
    document.getElementById('pETA').textContent   = '—';
    document.getElementById('pCurrent').textContent = 'Scraping complete — all students processed!';

    document.getElementById('completeSummary').style.display = 'block';
    document.getElementById('sTotal').textContent   = d.total;
    document.getElementById('sPass').textContent    = d.fullPass;
    document.getElementById('sBlog').textContent    = d.backlogs;
    document.getElementById('sErr').textContent     = d.errors;
    document.getElementById('sElapsed').textContent = d.elapsed || '—';
    if (d.excelFile) {
      const dlBtn = document.getElementById('dlBtn');
      dlBtn.href = `/api/jobs/${jobId}/download`;
      dlBtn.style.display = '';
    }
  });
}

// Pause/Resume toggle
function togglePause() {
  if (!currentJobId) return;
  if (window._jobPaused) {
    socket.emit('job:resume', { jobId: currentJobId });
  } else {
    socket.emit('job:pause', { jobId: currentJobId });
  }
}

// ════════════════════════════════════════════════════════
//  HISTORY PAGE
// ════════════════════════════════════════════════════════
async function renderHistory(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>📂 Job History</h2><p style="color:var(--color-muted)">All your past scraping jobs</p></div>
      <div>
        <button class="btn btn-outline" onclick="navigate('dashboard')">← Dashboard</button>
        <button class="btn" onclick="navigate('new-job')">🚀 New Job</button>
      </div>
    </div>
    <div id="histTable" class="glass" style="padding:1rem;overflow-x:auto;"><p style="color:var(--color-muted)">Loading...</p></div>
  </div>`;

  loadHistory();
}

async function loadHistory() {
  const data = await api('GET', '/api/jobs');
  const jobs = data.jobs || [];
  const div = document.getElementById('histTable');
  if (!jobs.length) {
    div.innerHTML = `<p style="color:var(--color-muted);text-align:center;padding:2rem;">No jobs yet. <a href="#/new-job">Create your first job.</a></p>`;
  } else {
    div.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Date</th><th>College</th><th>Sem</th><th>Total</th><th>Pass</th><th>BL</th><th>Err</th><th>Status</th><th>Excel</th><th>Del</th></tr></thead>
      <tbody>${jobs.map((j,i) => `
        <tr id="jobRow_${j.id}">
          <td>${i+1}</td>
          <td style="white-space:nowrap">${fmtDate(j.created_at)}</td>
          <td>${esc(j.portal_name || '—')}</td>
          <td>${esc(j.semester || '—')}</td>
          <td>${j.total_students}</td>
          <td style="color:var(--color-success);font-weight:600">${j.pass_count}</td>
          <td style="color:var(--color-warning);font-weight:600">${j.backlog_count}</td>
          <td style="color:var(--color-error)">${j.error_count}</td>
          <td><span class="badge ${j.status==='completed'?'success':j.status==='failed'?'error':'warning'}">${j.status}</span></td>
          <td>${j.status === 'completed' ? `<a href="/api/jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>` : '—'}</td>
          <td><button onclick="deleteJob(${j.id})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--color-error);padding:0.2rem;" title="Delete job">🗑</button></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }
}

async function deleteJob(id) {
  if (!confirm('Delete this job? This cannot be undone.')) return;
  const res = await api('DELETE', `/api/jobs/${id}`);
  if (res.error) { alert('Failed to delete: ' + res.error); return; }
  const row = document.getElementById(`jobRow_${id}`);
  if (row) row.style.transition = 'opacity 0.3s'; row && (row.style.opacity = '0');
  setTimeout(() => { if (row) row.remove(); loadHistory(); }, 300);
}

// ════════════════════════════════════════════════════════
//  ADMIN PANEL
// ════════════════════════════════════════════════════════
async function renderAdminPanel(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>🛡 Admin Dashboard</h2><p style="color:var(--color-muted)">Global system management</p></div>
      <button class="btn btn-outline" onclick="navigate('dashboard')">← Back</button>
    </div>

    <div class="stats-grid" id="adminStats">
      <div class="stat-card glass"><div class="stat-icon">👥</div><div class="stat-info"><h3 id="asUsers">—</h3><p>Total Users</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="asJobs">—</h3><p>Total Jobs</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🏫</div><div class="stat-info"><h3 id="asPortals">—</h3><p>Portals</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🎓</div><div class="stat-info"><h3 id="asScraped">—</h3><p>Students Scraped</p></div></div>
    </div>

    <div class="admin-tabs" style="display:flex;gap:1rem;margin-bottom:1.5rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.8rem;">
      <button class="tab-btn active" onclick="switchAdminTab('users')">Users</button>
      <button class="tab-btn" onclick="switchAdminTab('jobs')">All Jobs</button>
    </div>

    <div id="adminTabContent"></div>
  </div>`;

  // Start with users tab
  switchAdminTab('users');
  loadAdminStats();
}

async function loadAdminStats() {
  const data = await api('GET', '/api/admin/stats');
  if (data.stats) {
    document.getElementById('asUsers').textContent = data.stats.totalUsers;
    document.getElementById('asJobs').textContent = data.stats.totalJobs;
    document.getElementById('asPortals').textContent = data.stats.totalPortals;
    document.getElementById('asScraped').textContent = data.stats.totalStudentsScraped;
  }
}

async function switchAdminTab(tab) {
  const container = document.getElementById('adminTabContent');
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === tab));

  container.innerHTML = '<div class="loading">Loading tab...</div>';

  if (tab === 'users') {
    const data = await api('GET', '/api/admin/users');
    const users = data.users || [];
    container.innerHTML = `
    <div class="glass fade-in" style="padding:1rem;overflow-x:auto;">
      <table>
        <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Created</th><th>Action</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td>${u.id}</td>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.email)}</td>
            <td><span class="badge ${u.role === 'admin' ? 'warning' : 'success'}">${u.role}</span></td>
            <td>${fmtDate(u.created_at)}</td>
            <td>${u.id === currentUser.id ? '—' : `<button class="btn btn-outline" style="color:var(--color-error);border-color:var(--color-error);font-size:0.8rem;padding:0.2rem 0.6rem;" onclick="adminDeleteUser(${u.id})">Delete</button>`}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else if (tab === 'jobs') {
    const data = await api('GET', '/api/admin/jobs');
    const jobs = data.jobs || [];
    container.innerHTML = `
    <div class="glass fade-in" style="padding:1rem;overflow-x:auto;">
      <table>
        <thead><tr><th>Date</th><th>Owner</th><th>College</th><th>Sem</th><th>Total</th><th>Status</th><th>Excel</th></tr></thead>
        <tbody>${jobs.map(j => `
          <tr>
            <td style="white-space:nowrap">${fmtDate(j.created_at)}</td>
            <td><div><strong>${esc(j.owner_name)}</strong></div><small style="color:var(--color-muted)">${esc(j.owner_email)}</small></td>
            <td>${esc(j.portal_name || '—')}</td>
            <td>${esc(j.semester || '—')}</td>
            <td>${j.total_students}</td>
            <td><span class="badge ${j.status==='completed'?'success':j.status==='failed'?'error':'warning'}">${j.status}</span></td>
            <td>${j.status === 'completed' ? `<a href="/api/jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
}

// ════════════════════════════════════════════════════════
//  ADMIN PANEL ENHANCED
// ════════════════════════════════════════════════════════
async function renderAdminPanel(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>🛡 Admin Dashboard</h2><p style="color:var(--color-muted)">Global system management</p></div>
      <button class="btn btn-outline" onclick="navigate('dashboard')">← Back</button>
    </div>

    <div class="stats-grid" id="adminStats">
      <div class="stat-card glass"><div class="stat-icon">👥</div><div class="stat-info"><h3 id="asUsers">—</h3><p>Total Users</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="asJobs">—</h3><p>Total Jobs</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🏫</div><div class="stat-info"><h3 id="asPortals">—</h3><p>Portals</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">🎓</div><div class="stat-info"><h3 id="asScraped">—</h3><p>Students Scraped</p></div></div>
    </div>

    <div class="admin-tabs" style="display:flex;gap:1rem;margin-bottom:1.5rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.8rem;">
      <button class="tab-btn active" onclick="switchAdminTab('users')">Users</button>
      <button class="tab-btn" onclick="switchAdminTab('jobs')">All Jobs</button>
      <button class="tab-btn" onclick="switchAdminTab('ads')">Ad Management</button>
    </div>

    <div id="adminTabContent"></div>
  </div>`;

  // Start with users tab
  switchAdminTab('users');
  loadAdminStats();
}

async function loadAdminStats() {
  const data = await api('GET', '/api/admin/stats');
  if (data.stats) {
    document.getElementById('asUsers').textContent = data.stats.totalUsers;
    document.getElementById('asJobs').textContent = data.stats.totalJobs;
    document.getElementById('asPortals').textContent = data.stats.totalPortals;
    document.getElementById('asScraped').textContent = data.stats.totalStudentsScraped;
  }
}

async function switchAdminTab(tab) {
  const container = document.getElementById('adminTabContent');
  const btns = document.querySelectorAll('.tab-btn');
  btns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab)));

  container.innerHTML = '<div class="loading">Loading tab...</div>';

  if (tab === 'users') {
    const data = await api('GET', '/api/admin/users');
    const users = data.users || [];
    container.innerHTML = `
    <div class="glass fade-in" style="padding:1rem;overflow-x:auto;">
      <table>
        <thead><tr><th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Created</th><th>Action</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td>${u.id}</td>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.email)}</td>
            <td><span class="badge ${u.role === 'admin' ? 'warning' : 'success'}">${u.role}</span></td>
            <td>${fmtDate(u.created_at)}</td>
            <td><button class="btn btn-outline" style="font-size:0.8rem;padding:0.2rem 0.6rem;" onclick="adminViewUserData(${u.id})">🔍 View Data</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else if (tab === 'jobs') {
    const data = await api('GET', '/api/admin/jobs');
    const jobs = data.jobs || [];
    container.innerHTML = `
    <div class="glass fade-in" style="padding:1rem;overflow-x:auto;">
      <table>
        <thead><tr><th>Date</th><th>Owner</th><th>College</th><th>Sem</th><th>Total</th><th>Status</th><th>Excel</th></tr></thead>
        <tbody>${jobs.map(j => `
          <tr>
            <td style="white-space:nowrap">${fmtDate(j.created_at)}</td>
            <td><div><strong>${esc(j.owner_name)}</strong></div><small style="color:var(--color-muted)">${esc(j.owner_email)}</small></td>
            <td>${esc(j.portal_name || '—')}</td>
            <td>${esc(j.semester || '—')}</td>
            <td>${j.total_students}</td>
            <td><span class="badge ${j.status==='completed'?'success':j.status==='failed'?'error':'warning'}">${j.status}</span></td>
            <td>${j.status === 'completed' ? `<a href="/api/jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>` : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  } else if (tab === 'ads') {
    const data = await api('GET', '/api/admin/settings');
    const s = data.settings || {};
    container.innerHTML = `
    <div class="glass fade-in" style="padding:1.5rem; max-width:700px;">
      <h3>Ad Management</h3>
      <p style="color:var(--color-muted); margin-bottom:1.5rem;">Configure Google AdSense or other ad scripts.</p>
      
      <div id="adMsg" class="msg"></div>

      <div class="form-group">
        <label>Status</label>
        <select id="adEnabled" class="input">
          <option value="true" ${s.adsense_enabled === 'true' ? 'selected' : ''}>Enabled</option>
          <option value="false" ${s.adsense_enabled === 'false' ? 'selected' : ''}>Disabled</option>
        </select>
      </div>

      <div class="form-group">
        <label>AdSense Script Code</label>
        <textarea id="adScript" class="input" rows="8" style="font-family:var(--font-mono); font-size:0.8rem;" placeholder="Paste your <script> code here...">${esc(s.adsense_script || '')}</textarea>
      </div>

      <button class="btn" onclick="saveAdSettings()">💾 Save Settings</button>
    </div>`;
  }
}

async function adminViewUserData(userId) {
  const container = document.getElementById('adminTabContent');
  container.innerHTML = '<div class="loading">Loading user details...</div>';
  
  const data = await api('GET', `/api/admin/users/${userId}/data`);
  if (data.error) { container.innerHTML = `<p class="msg-error">${data.error}</p>`; return; }
  
  container.innerHTML = `
  <div class="fade-in">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
      <h3>Data for ${esc(data.user.username)}</h3>
      <button class="btn btn-outline" onclick="switchAdminTab('users')">← Back to List</button>
    </div>
    
    <div class="section-title">Portals (${data.portals.length})</div>
    <div class="glass" style="margin-bottom:1.5rem;">
      ${data.portals.length ? `
        <table>
          <thead><tr><th>Name</th><th>URL</th><th>Created</th></tr></thead>
          <tbody>${data.portals.map(p => `<tr><td>${esc(p.name)}</td><td><small>${esc(p.login_url)}</small></td><td>${fmtDate(p.created_at)}</td></tr>`).join('')}</tbody>
        </table>` : '<p style="padding:1rem;color:var(--color-muted)">No portals created.</p>'}
    </div>

    <div class="section-title">Jobs (${data.jobs.length})</div>
    <div class="glass">
      ${data.jobs.length ? `
        <table>
          <thead><tr><th>Date</th><th>College</th><th>Sem</th><th>Status</th></tr></thead>
          <tbody>${data.jobs.map(j => `<tr><td>${fmtDate(j.created_at)}</td><td>${esc(j.portal_name)}</td><td>${esc(j.semester)}</td><td>${j.status}</td></tr>`).join('')}</tbody>
        </table>` : '<p style="padding:1rem;color:var(--color-muted)">No jobs run yet.</p>'}
    </div>
  </div>`;
}

async function saveAdSettings() {
  const enabled = document.getElementById('adEnabled').value;
  const script = document.getElementById('adScript').value;
  const msg = document.getElementById('adMsg');
  
  showMsg(msg, 'Saving...', 'info');
  const res = await api('POST', '/api/admin/settings', { adsense_enabled: enabled, adsense_script: script });
  if (res.error) showMsg(msg, res.error, 'error');
  else {
    showMsg(msg, 'Settings saved successfully!', 'success');
    // Force ad reload
    injectAds();
  }
}

// ════════════════════════════════════════════════════════
//  PROFILE PAGE
// ════════════════════════════════════════════════════════
async function renderProfile(app) {
  const data = await api('GET', '/api/user/profile');
  if (data.error) { navigate('dashboard'); return; }
  
  const u = data.user;
  const s = data.stats;

  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>👤 Your Profile</h2><p style="color:var(--color-muted)">Manage your account</p></div>
      <button class="btn btn-outline" onclick="navigate('dashboard')">← Dashboard</button>
    </div>

    <!-- Name & Email Card -->
    <div class="glass profile-name-card" style="text-align:center; margin-bottom:1rem;">
      <div style="font-size:2.5rem; margin-bottom:0.3rem;">👤</div>
      <h3 style="margin:0; font-size:1.2rem;">${esc(u.username)}</h3>
      <p style="color:var(--color-muted); font-size:0.85rem; margin:0.2rem 0 0.5rem;">${esc(u.email)}</p>
      <div style="display:flex; justify-content:center; gap:0.8rem; font-size:0.82rem;">
        <span><strong>Role:</strong> <span class="badge ${u.role==='admin'?'warning':'success'}">${u.role}</span></span>
        <span style="color:var(--color-muted);">Joined: ${fmtDate(u.created_at)}</span>
      </div>
    </div>

    <!-- Stats: 2 half + 1 full -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.6rem; margin-bottom:1rem;">
      <div class="stat-card glass">
        <div class="stat-icon">📋</div>
        <div class="stat-info"><h3>${s.totalJobs}</h3><p>Total Jobs</p></div>
      </div>
      <div class="stat-card glass">
        <div class="stat-icon">🏫</div>
        <div class="stat-info"><h3>${s.totalPortals}</h3><p>Portals</p></div>
      </div>
    </div>
    <div class="stat-card glass" style="margin-bottom:1rem; justify-content:center;">
      <div class="stat-icon">🎓</div>
      <div class="stat-info"><h3>${s.totalStudentsScraped}</h3><p>Students Scraped</p></div>
    </div>

    <!-- Update Account -->
    <div class="glass">
      <h3 style="margin-bottom:0.8rem;">Update Account</h3>
      <div id="profMsg" class="msg"></div>
      <div class="form-group">
        <label>Username</label>
        <input id="updUser" class="input" value="${esc(u.username)}">
      </div>
      <div class="form-group">
        <label>New Password (leave blank to keep current)</label>
        <input id="updPass" type="password" class="input" placeholder="••••••••">
      </div>
      <button class="btn" onclick="updateProfile()">💾 Save Changes</button>
    </div>
  </div>`;
}

async function updateProfile() {
  const username = document.getElementById('updUser').value.trim();
  const password = document.getElementById('updPass').value;
  const msg = document.getElementById('profMsg');
  
  if (!username) { showMsg(msg, 'Username required', 'error'); return; }
  showMsg(msg, 'Updating...', 'info');
  
  const res = await api('PUT', '/api/user/profile', { username, password });
  if (res.error) showMsg(msg, res.error, 'error');
  else {
    currentUser = res.user;
    showMsg(msg, 'Profile updated successfully!', 'success');
  }
}

// ════════════════════════════════════════════════════════
//  INFO PAGES (Migrated)
// ════════════════════════════════════════════════════════
function renderAbout(app) {
  app.innerHTML = `
  <div class="fade-in glass" style="max-width:800px; margin:0 auto; line-height:1.6;">
    <h2 style="color:var(--color-primary); margin-bottom:1.5rem;">About RA Platform</h2>
    <p>Welcome to <strong>RAW (Results Automation Website)</strong>, your premier destination for streamlined academic data management.</p>
    <p style="margin-top:1rem;">Founded by <strong>Yarrabolu Venkata Satya Narayana Swamy</strong>, our platform is built to transform the tedious process of result collection into a seamless, high-speed automated experience.</p>
    <p style="margin-top:1rem;">We leverage cutting-edge web automation to gather, process, and present academic results accurately and efficiently.</p>
    <div style="margin-top:2rem;"><button class="btn btn-outline" onclick="history.back()">← Go Back</button></div>
  </div>`;
}

function renderContact(app) {
  app.innerHTML = `
  <div class="fade-in glass" style="max-width:500px; margin:0 auto;">
    <h2 style="color:var(--color-primary); margin-bottom:1.5rem;">Contact Us</h2>
    <p>Have questions or feedback? We'd love to hear from you.</p>
    <div style="margin-top:1.5rem;">
      <p>📧 Email: <a href="mailto:support@college.edu">support@college.edu</a></p>
      <p>📍 Location: Andhra Pradesh, India</p>
    </div>
    <div style="margin-top:2rem;"><button class="btn btn-outline" onclick="history.back()">← Go Back</button></div>
  </div>`;
}

function renderPrivacy(app) {
  app.innerHTML = `
  <div class="fade-in glass" style="max-width:900px; margin:0 auto; line-height:1.6; font-size:0.95rem;">
    <h2 style="color:var(--color-primary); margin-bottom:1.5rem;">Privacy Policy</h2>
    <p style="color:var(--color-muted); margin-bottom:2rem;">Last Updated: April 18, 2026</p>
    <p>At <strong>RAW (RESULTS AUTOMATION WEBSITE)</strong>, one of our main priorities is the privacy of our visitors. This Privacy Policy document contains types of information that is collected and recorded by RAW and how we use it.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">Log Files</h3>
    <p>RAW follows a standard procedure of using log files...</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">Cookies and Web Beacons</h3>
    <p>Like any other website, RAW uses "cookies"...</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">User Data Protection</h3>
    <p>For the results automation feature, we do not store student passwords permanently on our servers. All data scraped is processed in real-time.</p>
    <div style="margin-top:2rem;"><button class="btn btn-outline" onclick="history.back()">← Back</button></div>
  </div>`;
}

function renderTerms(app) {
  app.innerHTML = `
  <div class="fade-in glass" style="max-width:900px; margin:0 auto; line-height:1.6; font-size:0.95rem;">
    <h2 style="color:var(--color-primary); margin-bottom:1.5rem;">Terms & Conditions</h2>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">1. Acceptance of Terms</h3>
    <p>By accessing this website, you accept these terms and conditions in full.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">2. Use License</h3>
    <p>Permission is granted to use RAW's automation tools for personal, non-commercial educational purposes.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">3. User Responsibilities</h3>
    <p>Users must provide accurate roll numbers. RAW does not actively verify the identity of the students whose data is being scraped.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">4. Disclaimer of Liability</h3>
    <p>RAW shall not be held liable for any inaccuracies in the data retrieved from third-party portals.</p>
    <div style="margin-top:2rem;"><button class="btn btn-outline" onclick="history.back()">← Back</button></div>
  </div>`;
}

function renderDisclaimer(app) {
  app.innerHTML = `
  <div class="fade-in glass" style="max-width:900px; margin:0 auto; line-height:1.6; font-size:0.95rem;">
    <h2 style="color:var(--color-primary); margin-bottom:1.5rem;">Disclaimer</h2>
    <p style="color:var(--color-muted); margin-bottom:2rem;">Last Updated: April 18, 2026</p>
    <p>The information provided by <strong>RAW (RESULTS AUTOMATION WEBSITE)</strong> is for general informational purposes only.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">1. Data Accuracy</h3>
    <p>RAW is an automation tool that fetches data directly from third-party portals; any errors in those portals will be reflected in our results.</p>
    <h3 style="color:var(--color-primary); margin-top:1.5rem; margin-bottom:0.5rem;">2. Institutional Affiliation</h3>
    <p><strong>RAW is an independent tool and is NOT officially affiliated with any college or university.</strong></p>
    <div style="margin-top:2rem;"><button class="btn btn-outline" onclick="history.back()">← Back</button></div>
  </div>`;
}

// ════════════════════════════════════════════════════════
//  ADSENSE LOGIC
// ════════════════════════════════════════════════════════
async function injectAds() {
  try {
    const data = await api('GET', '/api/public/settings');
    const s = data.settings || {};
    if (s.adsense_enabled !== 'true' || !s.adsense_script) {
      document.querySelectorAll('.ad-slot').forEach(el => el.style.display = 'none');
      return;
    }

    document.querySelectorAll('.ad-slot').forEach(el => {
      el.style.display = 'flex';
      el.innerHTML = s.adsense_script;
      // Execute any scripts within the injected HTML
      el.querySelectorAll('script').forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.appendChild(document.createTextNode(oldScript.innerHTML));
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    });
  } catch (err) {
    console.warn('Ad injection error:', err);
  }
}



// ════════════════════════════════════════════════════════
//  MESS BILL SECTION
// ════════════════════════════════════════════════════════
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

async function renderMessBillDashboard(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div>
        <h2>💰 Mess Bill Data Portal</h2>
        <p style="color:var(--color-muted)">Automate hostel mess bill payment data collection</p>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" onclick="navigate('dashboard')">← Dashboard</button>
        <button class="btn" onclick="navigate('messbill-new')">🚀 New Collection</button>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="mbJobs">—</h3><p>Total Jobs</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">✅</div><div class="stat-info"><h3 id="mbPaid">—</h3><p>Paid</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">❌</div><div class="stat-info"><h3 id="mbNotPaid">—</h3><p>Not Paid</p></div></div>
    </div>
    <div class="section-title">Recent Jobs</div>
    <div id="mbRecent" class="glass" style="min-height:80px;padding:1rem;"><p style="color:var(--color-muted)">Loading...</p></div>
    <div style="display:flex;gap:1rem;margin-top:1.5rem;">
      <button class="btn btn-full btn-lg" onclick="navigate('messbill-new')">🚀 Start New Collection</button>
      <button class="btn btn-full btn-lg btn-outline" onclick="navigate('messbill-history')">📂 View History</button>
    </div>

    <div class="section-title" style="margin-top:2rem;">📄 Google Sheets Auto-Update</div>
    <div id="mbGoogleConfig" class="glass" style="padding:1.2rem;">
      <div id="gsMsg" class="msg"></div>
      <p style="color:var(--color-muted);font-size:0.88rem;margin-bottom:1rem;">
        Connect a Google Sheet so paid data is <strong>automatically filled</strong> after each job completes.
        No API keys needed — uses a simple Apps Script deployed from your sheet.
      </p>
      <div class="form-group">
        <label>Apps Script Web App URL</label>
        <input id="gsScriptUrl" class="input" type="url" placeholder="https://script.google.com/macros/s/xxxxx/exec" style="font-family:var(--font-mono);font-size:0.82rem;"/>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
        <button class="btn" onclick="saveGsConfig()">💾 Save URL</button>
        <button class="btn btn-outline" onclick="toggleGsSetup()">📋 Setup Guide</button>
      </div>
      <div id="gsSetupGuide" style="display:none; margin-top:1rem; background:rgba(255,255,255,0.03); padding:1rem; border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
        <h4 style="color:var(--color-primary);margin-bottom:0.8rem;">One-Time Setup (5 minutes)</h4>
        <ol style="color:var(--color-muted);font-size:0.85rem;line-height:1.7;padding-left:1.2rem;">
          <li>Open your Google Sheet → click <strong>Extensions → Apps Script</strong></li>
          <li>Delete any existing code in the editor</li>
          <li>Click the <strong>"Copy Script"</strong> button below and paste it</li>
          <li>Click <strong>Deploy → New Deployment</strong></li>
          <li>Select type: <strong>Web app</strong></li>
          <li>Set "Execute as": <strong>Me</strong></li>
          <li>Set "Who has access": <strong>Anyone</strong></li>
          <li>Click <strong>Deploy</strong> → Authorize when prompted</li>
          <li>Copy the <strong>Web App URL</strong> and paste it above</li>
        </ol>
        <button class="btn btn-outline" onclick="copyAppsScript()" style="margin-top:0.8rem;">📋 Copy Script Code</button>
        <span id="gsCopyStatus" style="margin-left:0.5rem;font-size:0.82rem;color:var(--color-success);display:none;">✅ Copied!</span>
      </div>
    </div>
  </div>`;
  const data = await api('GET','/api/payment-jobs');
  const jobs = data.jobs||[];
  document.getElementById('mbJobs').textContent = jobs.length;
  document.getElementById('mbPaid').textContent = jobs.reduce((s,j)=>s+(j.paid_count||0),0);
  document.getElementById('mbNotPaid').textContent = jobs.reduce((s,j)=>s+(j.not_paid_count||0),0);
  const div = document.getElementById('mbRecent');
  if(!jobs.length){ div.innerHTML=`<p style="color:var(--color-muted);text-align:center">No jobs yet. <a href="#/messbill-new">Create one.</a></p>`; }
  else { div.innerHTML=`<table><thead><tr><th>Date</th><th>Month</th><th>Students</th><th>Paid</th><th>Not Paid</th><th>Status</th><th>Action</th></tr></thead><tbody>${jobs.slice(0,5).map(j=>`<tr><td>${fmtDate(j.created_at)}</td><td>${j.target_month}/${j.target_year}</td><td>${j.total_students}</td><td style="color:var(--color-success);font-weight:600">${j.paid_count}</td><td style="color:var(--color-error)">${j.not_paid_count}</td><td><span class="badge ${j.status==='completed'?'success':j.status==='failed'?'error':'warning'}">${j.status}</span></td><td>${j.status==='completed'?`<a href="/api/payment-jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>`:'—'}</td></tr>`).join('')}</tbody></table>`; }
  // Load Google config
  const gsData = await api('GET','/api/payment-jobs/google-config');
  if(gsData.appsScriptUrl) document.getElementById('gsScriptUrl').value = gsData.appsScriptUrl;
}

async function saveGsConfig(){
  const url = document.getElementById('gsScriptUrl').value.trim();
  const msg = document.getElementById('gsMsg');
  showMsg(msg,'Saving...','info');
  const res = await api('POST','/api/payment-jobs/google-config',{appsScriptUrl:url});
  if(res.error) showMsg(msg,res.error,'error');
  else showMsg(msg,url?'✅ Apps Script URL saved! Sheet will auto-update after jobs.':'✅ Cleared. Sheet auto-update disabled.','success');
}

function toggleGsSetup(){
  const el=document.getElementById('gsSetupGuide');
  el.style.display=el.style.display==='none'?'block':'none';
}

async function copyAppsScript(){
  const res=await api('GET','/api/payment-jobs/apps-script-code');
  if(res.code){
    navigator.clipboard.writeText(res.code).then(()=>{
      const s=document.getElementById('gsCopyStatus');
      s.style.display='inline';
      setTimeout(()=>s.style.display='none',3000);
    }).catch(()=>alert('Copy failed. Check browser permissions.'));
  }
}

// ─── Mess Bill Wizard ───
const mbWizard = { step:1, students:[], month:'', year:'', sheetLink:'' };

async function renderMessBillWizard(app) {
  app.innerHTML = `
  <div class="fade-in">
    <div class="page-header">
      <div><h2>🚀 New Mess Bill Collection</h2><p style="color:var(--color-muted)">Collect payment data from KIET BillDesk</p></div>
      <button class="btn btn-outline" onclick="navigate('messbill')">← Back</button>
    </div>
    <div class="wizard-steps">
      <div class="wizard-step" id="mbStep1">1. Students</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="mbStep2">2. Sheet Link</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="mbStep3">3. Month</div>
      <div class="wizard-sep">›</div>
      <div class="wizard-step" id="mbStep4">4. Review</div>
    </div>
    <div id="mbWizBody" class="glass" style="padding:1.5rem;"></div>
  </div>`;
  mbWizard.step=1; mbWizard.students=[]; mbWizard.month=''; mbWizard.year=''; mbWizard.sheetLink='';
  renderMbStep();
}

function updateMbSteps(){for(let i=1;i<=4;i++){const el=document.getElementById(`mbStep${i}`);if(el)el.className='wizard-step'+(i<mbWizard.step?' done':i===mbWizard.step?' active':'');}}

function renderMbStep(){
  updateMbSteps();
  const body=document.getElementById('mbWizBody');
  if(mbWizard.step===1) renderMbStep1(body);
  else if(mbWizard.step===2) renderMbStep2_SheetLink(body);
  else if(mbWizard.step===3) renderMbStep3_Month(body);
  else if(mbWizard.step===4) renderMbStep4_Review(body);
}

function renderMbStep1(body){
  body.innerHTML=`
  <h3 style="margin-bottom:1rem;">Enter Student Data</h3>
  <div id="mbMsg" class="msg"></div>
  <p style="color:var(--color-muted);margin-bottom:0.5rem;">Paste student data (one per line).<br/>Format: <code style="background:rgba(255,255,255,0.06);padding:0.1rem 0.4rem;border-radius:4px;">SNO, ROOM_NO, ROLL_NO, NAME</code></p>
  <textarea id="mbInput" class="input" rows="12" style="font-family:var(--font-mono);font-size:0.85rem;resize:vertical;"
  placeholder="1,DH201,23B21A45B0,Tamarana Pavan Kumar
2,DH201,23B21A45A6,MANDADI NAGARATNAKAR
3,DH202A,23B21A4359,KAMUJU MANI DILEEP">${mbWizard.students.length?mbWizard.students.map(s=>`${s.sno||''},${s.roomNo||''},${s.rollNo},${s.name||''}`).join('\n'):''}</textarea>
  <p id="mbCount" style="color:var(--color-muted);font-size:0.85rem;margin-top:0.5rem;">0 students</p>
  <div style="margin-top:1.5rem;"><button class="btn" onclick="mbNext1()">Next →</button></div>`;
  const ta=document.getElementById('mbInput');
  ta.addEventListener('input',()=>{const lines=ta.value.split('\n').filter(l=>l.trim());document.getElementById('mbCount').textContent=`${lines.length} student${lines.length===1?'':'s'}`;});
  if(mbWizard.students.length) ta.dispatchEvent(new Event('input'));
}

function mbNext1(){
  const raw=document.getElementById('mbInput').value.trim();
  const msg=document.getElementById('mbMsg');
  if(!raw){showMsg(msg,'Please enter student data','error');return;}
  const lines=raw.split('\n').map(l=>l.trim()).filter(Boolean);
  const students=[];
  for(const line of lines){
    if(line.startsWith('{'))continue;
    let parts;
    if(line.includes('\t')) parts=line.split('\t');
    else if(line.includes(',')) parts=line.split(',');
    else parts=line.split(/\s+/);
    if(parts.length>=3){
      const sno=parts[0].trim();
      const roomNo=parts[1].trim();
      const rollNo=parts[2].trim();
      const name=parts.slice(3).join(' ').trim()||rollNo;
      if(rollNo.match(/[A-Z0-9]{5,}/i)) students.push({sno,roomNo,rollNo,name});
    } else if(parts.length>=1){
      const rollNo=parts[0].trim();
      if(rollNo.match(/[A-Z0-9]{5,}/i)) students.push({sno:'',roomNo:'',rollNo,name:rollNo});
    }
  }
  if(!students.length){showMsg(msg,'No valid students found','error');return;}
  mbWizard.students=students;
  mbWizard.step=2;
  renderMbStep();
}

// Step 2: Sheet Link (optional Excel/Google Sheets URL)
function renderMbStep2_SheetLink(body){
  body.innerHTML=`
  <h3 style="margin-bottom:1rem;">📄 Excel Sheet Link <span style="font-size:0.8rem;color:var(--color-muted);font-weight:400;">(Optional)</span></h3>
  <div id="mbMsg" class="msg"></div>
  <p style="color:var(--color-muted);margin-bottom:0.5rem;">Paste a Google Sheets or Excel link that has roll numbers.<br/>
  The sheet will be recreated in the output with <strong>only paid students' data filled in</strong>.</p>
  <div class="form-group">
    <label>Sheet Link (Google Sheets URL)</label>
    <input id="mbSheetLink" class="input" type="url" value="${esc(mbWizard.sheetLink||'')}" placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit" style="font-family:var(--font-mono);font-size:0.85rem;"/>
  </div>
  <div style="background:rgba(255,255,255,0.04);padding:0.8rem 1rem;border-radius:8px;margin-top:0.5rem;border:1px solid rgba(255,255,255,0.08);">
    <p style="font-size:0.82rem;color:var(--color-muted);margin:0;">💡 <strong>How it works:</strong> If provided, Sheet 3 in the output Excel will mirror this sheet's structure and fill payment data for students who have paid the mess bill.</p>
  </div>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="mbWizard.step=1;renderMbStep();">← Back</button>
    <button class="btn" onclick="mbNextSheetLink()">Next →</button>
  </div>`;
}

function mbNextSheetLink(){
  mbWizard.sheetLink=(document.getElementById('mbSheetLink').value||'').trim();
  mbWizard.step=3;
  renderMbStep();
}

// Step 3: Month/Year selection
function renderMbStep3_Month(body){
  const curYear=new Date().getFullYear();
  const years=[curYear-1,curYear,curYear+1];
  body.innerHTML=`
  <h3 style="margin-bottom:1rem;">Select Target Month & Year</h3>
  <div id="mbMsg" class="msg"></div>
  <p style="color:var(--color-muted);margin-bottom:1rem;">${mbWizard.students.length} students loaded</p>
  <div class="form-group"><label>Month</label>
    <select id="mbMonth" class="input">${MONTH_NAMES.map((m,i)=>`<option value="${i+1}" ${mbWizard.month===(i+1).toString()?'selected':''}>${m}</option>`).join('')}</select>
  </div>
  <div class="form-group"><label>Year</label>
    <select id="mbYear" class="input">${years.map(y=>`<option value="${y}" ${mbWizard.year===y.toString()||(!mbWizard.year&&y===curYear)?'selected':''}>${y}</option>`).join('')}</select>
  </div>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="mbWizard.step=2;renderMbStep();">← Back</button>
    <button class="btn" onclick="mbNextMonth()">Next →</button>
  </div>`;
}

function mbNextMonth(){
  mbWizard.month=document.getElementById('mbMonth').value;
  mbWizard.year=document.getElementById('mbYear').value;
  mbWizard.step=4;
  renderMbStep();
}

// Step 4: Review & Start
function renderMbStep4_Review(body){
  const monthName=MONTH_NAMES[parseInt(mbWizard.month)-1]||mbWizard.month;
  body.innerHTML=`
  <h3 style="margin-bottom:1rem;">Review & Start</h3>
  <div class="review-grid">
    <div class="review-item"><div class="review-label">Students</div><div class="review-value">${mbWizard.students.length}</div></div>
    <div class="review-item"><div class="review-label">Target Month</div><div class="review-value">${monthName} ${mbWizard.year}</div></div>
    <div class="review-item"><div class="review-label">Portal</div><div class="review-value">KIET BillDesk (Hostel)</div></div>
    <div class="review-item"><div class="review-label">Sheet Link</div><div class="review-value" style="font-size:0.8rem;word-break:break-all;">${mbWizard.sheetLink ? '✅ ' + esc(mbWizard.sheetLink.substring(0,60)) + (mbWizard.sheetLink.length>60?'...':'') : '<span style="color:var(--color-muted)">None provided</span>'}</div></div>
  </div>
  <div class="glass" style="margin-top:1rem;padding:1rem;max-height:150px;overflow-y:auto;">
    <small style="color:var(--color-muted)">Students preview:</small>
    ${mbWizard.students.slice(0,8).map(s=>`<div style="font-size:0.85rem;color:var(--color-text);">${esc(s.sno)} | ${esc(s.roomNo)} | ${esc(s.rollNo)} — ${esc(s.name)}</div>`).join('')}
    ${mbWizard.students.length>8?`<div style="color:var(--color-muted);font-size:0.85rem;">...and ${mbWizard.students.length-8} more</div>`:''}
  </div>
  <div id="mbMsg" class="msg"></div>
  <div style="margin-top:1.5rem;display:flex;gap:1rem;">
    <button class="btn btn-outline" onclick="mbWizard.step=3;renderMbStep();">← Back</button>
    <button class="btn btn-lg" id="mbStartBtn" onclick="mbStartJob()">🚀 Start Collection</button>
  </div>`;
}

async function mbStartJob(){
  const msg=document.getElementById('mbMsg');
  const btn=document.getElementById('mbStartBtn');
  btn.disabled=true; btn.textContent='⏳ Creating job...';
  showMsg(msg,'Setting up job...','info');
  socket.emit('job:auth');
  const payload = {
    students: mbWizard.students,
    target_month: mbWizard.month,
    target_year: mbWizard.year,
    sheet_link: mbWizard.sheetLink || '',
  };
  const res=await api('POST','/api/payment-jobs', payload);
  if(res.error){showMsg(msg,res.error,'error');btn.disabled=false;btn.textContent='🚀 Start Collection';return;}
  currentPaymentJobId=res.jobId;
  window.location.hash='#/messbill-progress';
}

// ─── Mess Bill Progress Page ───
function renderMessBillProgress(app, jobId){
  app.innerHTML=`
  <div class="fade-in">
    <div class="page-header">
      <div><h2>💰 Mess Bill Progress</h2><p style="color:var(--color-muted)">Live collection</p></div>
      <div style="display:flex;gap:0.5rem;">
        <button class="btn btn-outline" id="mbPauseBtn" onclick="mbTogglePause()" style="display:none;">⏸ Pause</button>
        <button class="btn btn-outline" onclick="navigate('messbill-history')">📂 History</button>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card glass"><div class="stat-icon">🎓</div><div class="stat-info"><h3 id="mbpTotal">—</h3><p>Total</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">✅</div><div class="stat-info"><h3 id="mbpDone">0</h3><p>Done</p></div></div>
      <div class="stat-card glass"><div class="stat-icon">⏱</div><div class="stat-info"><h3 id="mbpETA">—</h3><p>ETA</p></div></div>
    </div>
    <div class="glass" style="padding:1.5rem;margin-bottom:1rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
        <span id="mbpPhase" style="font-weight:600;color:var(--color-primary)">Starting...</span>
        <span id="mbpPct">0%</span>
      </div>
      <div class="progress-bar"><div class="fill" id="mbpBar" style="width:0%"></div></div>
      <p id="mbpCurrent" style="margin-top:0.5rem;font-size:0.85rem;color:var(--color-muted)">Waiting...</p>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div class="glass" style="padding:1rem;">
        <h4 style="margin-bottom:0.5rem;">Live Results</h4>
        <div style="overflow-y:auto;max-height:280px;">
          <table><thead><tr><th>#</th><th>Roll No</th><th>Status</th><th>Amount</th></tr></thead><tbody id="mbLiveResults"></tbody></table>
        </div>
      </div>
      <div class="glass" style="padding:1rem;">
        <h4 style="margin-bottom:0.5rem;">Console Log</h4>
        <div id="mbLiveLog" style="overflow-y:auto;max-height:280px;font-family:var(--font-mono);font-size:0.78rem;color:var(--color-muted);"></div>
      </div>
    </div>
    <div id="mbCompleteSummary" style="display:none;margin-top:1rem;" class="glass">
      <h3 style="color:var(--color-success);">✅ Collection Complete!</h3>
      <div class="stats-grid" style="margin-top:1rem;">
        <div class="stat-card glass"><div class="stat-icon">📋</div><div class="stat-info"><h3 id="mbsTotal">—</h3><p>Total</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">✅</div><div class="stat-info"><h3 id="mbsPaid">—</h3><p>Paid</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">❌</div><div class="stat-info"><h3 id="mbsNotPaid">—</h3><p>Not Paid</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">⚠️</div><div class="stat-info"><h3 id="mbsErr">—</h3><p>Errors</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">⏱</div><div class="stat-info"><h3 id="mbsElapsed">—</h3><p>Time Taken</p></div></div>
        <div class="stat-card glass"><div class="stat-icon">📄</div><div class="stat-info"><h3 id="mbsSheet">—</h3><p>Sheet Update</p></div></div>
      </div>
      <div style="margin-top:1rem;display:flex;gap:1rem;">
        <a id="mbDlBtn" href="#" class="btn" style="display:none;">⬇ Download Excel</a>
        <button class="btn btn-outline" onclick="navigate('messbill')">← Mess Bill</button>
      </div>
    </div>
  </div>`;

  // Clear old listeners
  socket.off('payment:started');socket.off('payment:progress');socket.off('payment:student-done');
  socket.off('payment:log');socket.off('payment:complete');socket.off('payment:error');
  socket.off('payment:paused');socket.off('payment:resumed');socket.off('payment:reconnect-data');

  window._mbPaused=false;

  function showMbPause(paused){
    const btn=document.getElementById('mbPauseBtn');if(!btn)return;
    btn.style.display='';window._mbPaused=paused;
    btn.textContent=paused?'▶ Resume':'⏸ Pause';
  }

  socket.once('job:auth-ok',()=>{socket.emit('payment:reconnect',{jobId});});
  socket.emit('job:auth');

  socket.once('payment:reconnect-data',(d)=>{
    if(d.running){
      if(d.total) document.getElementById('mbpTotal').textContent=d.total;
      showMbPause(d.paused);
      const tbody=document.getElementById('mbLiveResults');tbody.innerHTML='';
      (d.results||[]).forEach(r=>{
        const sc=r.status==='PAID'?'success':r.status==='NOT_PAID'?'error':'warning';
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>${r.index+1}</td><td><strong>${esc(r.rollNo)}</strong></td><td><span class="badge ${sc}">${r.status}</span></td><td>${r.amounts||'—'}</td>`;
        tbody.insertBefore(tr,tbody.firstChild);
      });
      document.getElementById('mbpDone').textContent=(d.results||[]).length;
      const log=document.getElementById('mbLiveLog');log.innerHTML='';
      (d.logs||[]).forEach(l=>{const div=document.createElement('div');div.textContent=`[${new Date(l.time).toLocaleTimeString()}] ${l.message}`;log.appendChild(div);});
      log.scrollTop=log.scrollHeight;
      window._mbReconnect=true;
    } else { window._mbReconnect=true; socket.emit('payment:start',{jobId}); }
  });

  setTimeout(()=>{if(!window._mbReconnect){socket.emit('payment:start',{jobId});}},2000);

  socket.on('payment:paused',d=>{if(d.jobId==jobId)showMbPause(true);});
  socket.on('payment:resumed',d=>{if(d.jobId==jobId)showMbPause(false);});
  socket.on('payment:started',d=>{if(d.jobId==jobId){document.getElementById('mbpTotal').textContent=d.total;showMbPause(false);}});

  socket.on('payment:progress',d=>{
    if(d.jobId!=jobId)return;
    const phases={launching:'🚀 Launching',running:'💰 Collecting',paused:'⏸ Paused',generating:'📊 Building Excel',done:'✅ Complete'};
    document.getElementById('mbpPhase').textContent=phases[d.phase]||d.phase;
    document.getElementById('mbpPct').textContent=d.percentage+'%';
    document.getElementById('mbpBar').style.width=d.percentage+'%';
    if(d.eta!==undefined)document.getElementById('mbpETA').textContent=d.eta;
    document.getElementById('mbpDone').textContent=d.current||0;
    document.getElementById('mbpTotal').textContent=d.total||'?';
    if(d.currentStudent) document.getElementById('mbpCurrent').textContent='▶ '+d.currentStudent.rollNo+' — '+(d.currentStudent.name||'');
  });

  socket.on('payment:student-done',d=>{
    if(d.jobId!=jobId)return;
    const tbody=document.getElementById('mbLiveResults');
    const sc=d.status==='PAID'?'success':d.status==='NOT_PAID'?'error':'warning';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${d.index+1}</td><td><strong>${esc(d.rollNo)}</strong>${d.rollNoMismatch?'<span style="color:var(--color-warning);font-size:0.75rem;"> ⚠️ MISMATCH</span>':''}</td><td><span class="badge ${sc}">${d.status==='MISMATCH'?'⚠️ MISMATCH':d.status}</span></td><td>${d.amounts||'—'}</td>`;
    tbody.insertBefore(tr,tbody.firstChild);
    document.getElementById('mbpDone').textContent=d.index+1;
  });

  socket.on('payment:log',d=>{
    if(d.jobId!=jobId)return;
    const log=document.getElementById('mbLiveLog');
    const div=document.createElement('div');div.textContent=`[${new Date(d.time).toLocaleTimeString()}] ${d.message}`;
    log.appendChild(div);log.scrollTop=log.scrollHeight;
  });

  socket.on('payment:complete',d=>{
    if(d.jobId!=jobId)return;
    const pb=document.getElementById('mbPauseBtn');if(pb)pb.style.display='none';
    document.getElementById('mbpPhase').textContent='✅ Complete';
    document.getElementById('mbpPct').textContent='100%';
    document.getElementById('mbpBar').style.width='100%';
    document.getElementById('mbpETA').textContent='—';
    document.getElementById('mbpCurrent').textContent='Collection complete!';
    document.getElementById('mbCompleteSummary').style.display='block';
    document.getElementById('mbsTotal').textContent=d.total;
    document.getElementById('mbsPaid').textContent=d.paid;
    document.getElementById('mbsNotPaid').textContent=d.notPaid;
    document.getElementById('mbsErr').textContent=d.errors;
    document.getElementById('mbsElapsed').textContent=d.elapsed||'—';
    // Google Sheets update status
    const sheetEl=document.getElementById('mbsSheet');
    if(d.sheetUpdated){
      sheetEl.textContent=`✅ ${d.sheetFilled||0} filled`;
      sheetEl.style.color='var(--color-success)';
    } else {
      sheetEl.textContent='Not linked';
      sheetEl.style.color='var(--color-muted)';
    }
    if(d.excelFile){const dl=document.getElementById('mbDlBtn');dl.href=`/api/payment-jobs/${jobId}/download`;dl.style.display='';}
  });

  socket.on('payment:error',d=>{
    document.getElementById('mbpPhase').textContent='❌ Error';
    document.getElementById('mbpCurrent').textContent=typeof d==='string'?d:(d.message||'Unknown error');
  });
}

function mbTogglePause(){
  if(!currentPaymentJobId)return;
  if(window._mbPaused) socket.emit('payment:resume',{jobId:currentPaymentJobId});
  else socket.emit('payment:pause',{jobId:currentPaymentJobId});
}

// ─── Mess Bill History ───
async function renderMessBillHistory(app){
  app.innerHTML=`
  <div class="fade-in">
    <div class="page-header">
      <div><h2>📂 Mess Bill History</h2><p style="color:var(--color-muted)">Past collection jobs</p></div>
      <div><button class="btn btn-outline" onclick="navigate('messbill')">← Back</button><button class="btn" onclick="navigate('messbill-new')" style="margin-left:0.5rem;">🚀 New</button></div>
    </div>
    <div id="mbHistTable" class="glass" style="padding:1rem;overflow-x:auto;"><p style="color:var(--color-muted)">Loading...</p></div>
  </div>`;
  const data=await api('GET','/api/payment-jobs');
  const jobs=data.jobs||[];
  const div=document.getElementById('mbHistTable');
  if(!jobs.length){div.innerHTML=`<p style="color:var(--color-muted);text-align:center;padding:2rem;">No jobs yet.</p>`;}
  else{div.innerHTML=`<table><thead><tr><th>#</th><th>Date</th><th>Month</th><th>Total</th><th>Paid</th><th>Not Paid</th><th>Err</th><th>Status</th><th>Excel</th><th>Del</th></tr></thead><tbody>${jobs.map((j,i)=>`<tr id="mbJobRow_${j.id}"><td>${i+1}</td><td style="white-space:nowrap">${fmtDate(j.created_at)}</td><td>${j.target_month}/${j.target_year}</td><td>${j.total_students}</td><td style="color:var(--color-success);font-weight:600">${j.paid_count}</td><td style="color:var(--color-error)">${j.not_paid_count}</td><td>${j.error_count}</td><td><span class="badge ${j.status==='completed'?'success':j.status==='failed'?'error':'warning'}">${j.status}</span></td><td>${j.status==='completed'?`<a href="/api/payment-jobs/${j.id}/download" class="btn btn-outline" style="padding:0.2rem 0.6rem;font-size:0.8rem;">⬇ Excel</a>`:'—'}</td><td><button onclick="deleteMbJob(${j.id})" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--color-error);">🗑</button></td></tr>`).join('')}</tbody></table>`;}
}

async function deleteMbJob(id){
  if(!confirm('Delete this job?'))return;
  const res=await api('DELETE',`/api/payment-jobs/${id}`);
  if(res.error){alert('Failed: '+res.error);return;}
  const row=document.getElementById(`mbJobRow_${id}`);
  if(row){row.style.transition='opacity 0.3s';row.style.opacity='0';}
  setTimeout(()=>{if(row)row.remove();},300);
}

// ════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════
function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = `msg msg-${type}`;
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
}

// ─── Socket badge ───
document.addEventListener('DOMContentLoaded', () => {
  renderFooter(); // initial footer render
  socket.on('connect', () => {
    const badge = document.getElementById('connectionBadge');
    if (badge) {
      badge.classList.add('connected');
      const txt = badge.querySelector('.text');
      if (txt) txt.textContent = 'Connected';
    }
  });
  socket.on('disconnect', () => {
    const badge = document.getElementById('connectionBadge');
    if (badge) {
      badge.classList.remove('connected');
      const txt = badge.querySelector('.text');
      if (txt) txt.textContent = 'Disconnected';
    }
  });
});

// ════════════════════════════════════════════════════════
//  FOOTER RENDERER
// ════════════════════════════════════════════════════════
function renderFooter() {
  const footer = document.getElementById('footer');
  if (!footer) return;
  footer.innerHTML = `
  <div class="glass" style="margin: 0; border-radius: 0; text-align: center; font-size: 0.85rem; color: var(--color-muted); padding: 2rem 1rem;">
    <div style="margin-bottom: 1rem;">
      &copy; 2026 RAW (RESULTS AUTOMATION WEBSITE). All rights reserved.
    </div>
    <div style="display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap;">
      <a href="#/about">About Us</a>
      <a href="#/contact">Contact Us</a>
      <a href="#/privacy">Privacy Policy</a>
      <a href="#/terms">Terms & Conditions</a>
      <a href="#/disclaimer">Disclaimer</a>
    </div>
  </div>`;
}

