/**
 * DINOCO Brand Voice — Extension Popup
 * V.1.0
 */

// Default meta (fallback if API unreachable)
const DEFAULT_META = {
  brands: ['DINOCO', 'SRC', 'F2MOTO', 'BMMOTO', 'MOTOSkill', 'H2C'],
  categories: {
    quality: 'คุณภาพสินค้า', price: 'ราคา', design: 'ดีไซน์/ความสวยงาม',
    fitment: 'Fitment/ความพอดี', service: 'บริการ/หลังการขาย', shipping: 'จัดส่ง',
    warranty: 'รับประกัน', availability: 'หาซื้อง่าย', comparison: 'เปรียบเทียบแบรนด์',
  },
  models: ['CB650R', 'CB500X', 'CB500F', 'Rebel 500', 'Forza 350', 'ADV 350', 'CL500', 'XL750', 'CRF300L', 'PCX160', 'NX500'],
  platforms: {
    facebook_group: 'Facebook Group', facebook_page: 'Facebook Page',
    youtube: 'YouTube', tiktok: 'TikTok', pantip: 'Pantip',
    instagram: 'Instagram', line: 'LINE', other: 'อื่นๆ',
  },
};

const PLAT_ICONS = {
  facebook_group: '📘', facebook_page: '📘', youtube: '▶️',
  tiktok: '🎵', pantip: '🟦', instagram: '📷', line: '💚', other: '🌐',
};

let config = { siteUrl: '', apiKey: '' };
let meta = DEFAULT_META;
let pageData = {};
let currentSentiment = 'neutral';

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['bv_site_url', 'bv_api_key']);
  if (stored.bv_site_url && stored.bv_api_key) {
    config.siteUrl = stored.bv_site_url;
    config.apiKey = stored.bv_api_key;
    showForm();
  } else {
    showSetup();
  }

  // Event listeners
  document.getElementById('setup-save').addEventListener('click', saveSetup);
  document.getElementById('btn-save').addEventListener('click', () => submitEntry(false));
  document.getElementById('btn-save-next').addEventListener('click', () => submitEntry(true));
  document.getElementById('btn-back').addEventListener('click', () => {
    document.getElementById('status-screen').classList.remove('active');
    document.getElementById('main-form').classList.add('active');
  });
  document.getElementById('btn-reset').addEventListener('click', resetSetup);

  // Sentiment buttons
  document.querySelectorAll('.sent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sent-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSentiment = btn.dataset.val;
    });
  });
});

// ─── Setup ───
function showSetup() {
  document.getElementById('setup-screen').style.display = 'block';
  document.getElementById('main-form').classList.remove('active');
  document.getElementById('settings-bar').style.display = 'none';
}

async function saveSetup() {
  const url = document.getElementById('setup-url').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('setup-key').value.trim();
  if (!url || !key) return alert('กรุณากรอกข้อมูลให้ครบ');

  // Test connection
  try {
    const resp = await fetch(url + '/wp-json/brand-voice/v1/meta', {
      headers: { 'X-BV-API-Key': key },
    });
    if (!resp.ok) throw new Error('API Key ไม่ถูกต้อง หรือเว็บไม่ตอบ');
    meta = await resp.json();
  } catch (e) {
    alert('เชื่อมต่อไม่สำเร็จ: ' + e.message);
    return;
  }

  config.siteUrl = url;
  config.apiKey = key;
  await chrome.storage.local.set({ bv_site_url: url, bv_api_key: key });
  showForm();
}

function resetSetup() {
  chrome.storage.local.remove(['bv_site_url', 'bv_api_key']);
  config = { siteUrl: '', apiKey: '' };
  showSetup();
}

// ─── Main Form ───
async function showForm() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('main-form').classList.add('active');
  document.getElementById('settings-bar').style.display = 'flex';
  document.getElementById('conn-status').textContent = '● ' + config.siteUrl.replace(/https?:\/\//, '');

  // Fetch meta from server (update brands/categories)
  try {
    const resp = await fetch(config.siteUrl + '/wp-json/brand-voice/v1/meta', {
      headers: { 'X-BV-API-Key': config.apiKey },
    });
    if (resp.ok) meta = await resp.json();
  } catch (e) { /* use default */ }

  renderChips();
  loadPageData();
}

function renderChips() {
  // Brands
  const brandsEl = document.getElementById('f-brands');
  brandsEl.innerHTML = '';
  meta.brands.forEach(b => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = b;
    chip.dataset.value = b;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    brandsEl.appendChild(chip);
  });

  // Categories
  const catsEl = document.getElementById('f-categories');
  catsEl.innerHTML = '';
  const cats = meta.categories;
  Object.keys(cats).forEach(k => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = cats[k];
    chip.dataset.value = k;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    catsEl.appendChild(chip);
  });

  // Models
  const modelsEl = document.getElementById('f-models');
  modelsEl.innerHTML = '';
  meta.models.forEach(m => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = m;
    chip.dataset.value = m;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    modelsEl.appendChild(chip);
  });
}

async function loadPageData() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageData' });
    if (resp) {
      pageData = resp;
      fillForm(resp);
    }
  } catch (e) {
    // Content script not loaded (unsupported page)
    pageData = {
      url: '', selectedText: '', pageTitle: '', platform: 'other',
      sourceName: '', authorName: '',
    };
    document.getElementById('source-bar').innerHTML =
      '<span class="plat-icon">🌐</span><span>หน้านี้ไม่รองรับ auto-detect — กรอกเอง</span>';
  }
}

function fillForm(data) {
  // Source bar
  const platName = meta.platforms[data.platform] || data.platform;
  document.getElementById('plat-icon').textContent = PLAT_ICONS[data.platform] || '🌐';
  document.getElementById('source-label').textContent = data.sourceName || platName;

  // Content
  if (data.selectedText) {
    document.getElementById('f-content').value = data.selectedText;
    // Auto summary
    const sum = data.selectedText.length > 80
      ? data.selectedText.substring(0, 77) + '...'
      : data.selectedText;
    document.getElementById('f-summary').value = sum;
  }

  // Auto-detect brand mentions in content
  if (data.selectedText) {
    const text = data.selectedText.toUpperCase();
    document.querySelectorAll('#f-brands .chip').forEach(chip => {
      if (text.includes(chip.dataset.value.toUpperCase())) {
        chip.classList.add('selected');
      }
    });
  }

  // Auto-detect models in content
  if (data.selectedText) {
    const text = data.selectedText.toUpperCase();
    document.querySelectorAll('#f-models .chip').forEach(chip => {
      if (text.includes(chip.dataset.value.toUpperCase())) {
        chip.classList.add('selected');
      }
    });
  }
}

// ─── Submit ───
async function submitEntry(continueMode) {
  const content = document.getElementById('f-content').value.trim();
  const summary = document.getElementById('f-summary').value.trim();
  if (!content && !summary) return alert('กรุณากรอกข้อความหรือสรุปอย่างน้อย 1 อย่าง');

  const brands = Array.from(document.querySelectorAll('#f-brands .chip.selected')).map(c => c.dataset.value);
  const categories = Array.from(document.querySelectorAll('#f-categories .chip.selected')).map(c => c.dataset.value);
  const models = Array.from(document.querySelectorAll('#f-models .chip.selected')).map(c => c.dataset.value);

  const payload = {
    content,
    summary,
    brands,
    sentiment: currentSentiment,
    intensity: 3,
    categories,
    platform: pageData.platform || 'other',
    source_url: pageData.url || '',
    source_name: pageData.sourceName || '',
    post_date: pageData.postDate || new Date().toISOString().slice(0, 10),
    models,
    author_name: pageData.authorName || '',
    has_photo: pageData.hasPhoto || false,
    engagement: 'medium',
    tags: document.getElementById('f-tags').value.trim(),
    _agent: { agent_id: 'chrome_extension_v1' },
  };

  const btn = document.getElementById(continueMode ? 'btn-save-next' : 'btn-save');
  btn.disabled = true;
  btn.textContent = 'กำลังบันทึก...';

  try {
    const resp = await fetch(config.siteUrl + '/wp-json/brand-voice/v1/entries', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BV-API-Key': config.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (resp.ok && data.success) {
      if (continueMode) {
        // Clear form but keep brands/models selected
        document.getElementById('f-content').value = '';
        document.getElementById('f-summary').value = '';
        document.getElementById('f-tags').value = '';
        btn.disabled = false;
        btn.textContent = 'บันทึก & เก็บต่อ';
        // Flash success
        btn.style.background = '#16a34a';
        btn.textContent = '✓ บันทึกแล้ว';
        setTimeout(() => { btn.style.background = ''; btn.textContent = 'บันทึก & เก็บต่อ'; }, 1500);
      } else {
        showStatus('success', 'บันทึกสำเร็จ!', 'Entry #' + data.entry_id + ' ถูกบันทึกเข้า Brand Voice Pool');
      }
    } else if (data.code === 'duplicate') {
      showStatus('error', 'ข้อมูลซ้ำ', 'URL นี้ถูกบันทึกไปแล้ว (Entry #' + data.existing_id + ')');
    } else {
      showStatus('error', 'เกิดข้อผิดพลาด', data.message || 'ไม่สามารถบันทึกได้');
    }
  } catch (e) {
    showStatus('error', 'เชื่อมต่อไม่ได้', e.message);
  }

  btn.disabled = false;
  btn.textContent = continueMode ? 'บันทึก & เก็บต่อ' : 'บันทึก Brand Voice';
}

function showStatus(type, title, message) {
  document.getElementById('main-form').classList.remove('active');
  const screen = document.getElementById('status-screen');
  screen.classList.add('active');
  document.getElementById('status-title').textContent = (type === 'success' ? '✓ ' : '✗ ') + title;
  document.getElementById('status-title').className = type === 'success' ? 'status-success' : 'status-error';
  document.getElementById('status-message').textContent = message;
}
