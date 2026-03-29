/**
 * DINOCO Brand Voice — Extension Popup V.2.0
 * One-click: ดึง Post+Comments → AI วิเคราะห์ → บันทึกแยกทีละ entry
 */

let config = { siteUrl: '', apiKey: '' };
let pageData = {};

const PLAT_ICONS = {
  facebook_group: '📘', facebook_page: '📘', youtube: '▶️',
  tiktok: '🎵', pantip: '🟦', instagram: '📷', other: '🌐',
};
const PLAT_NAMES = {
  facebook_group: 'Facebook Group', facebook_page: 'Facebook Page',
  youtube: 'YouTube', tiktok: 'TikTok', pantip: 'Pantip',
  instagram: 'Instagram', other: 'Other',
};
const SENT_BADGE = {
  positive: ['badge-pos', 'Positive'],
  negative: ['badge-neg', 'Negative'],
  neutral:  ['badge-neu', 'Neutral'],
  mixed:    ['badge-mix', 'Mixed'],
};

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['bv_site_url', 'bv_api_key']);
  if (stored.bv_site_url && stored.bv_api_key) {
    config.siteUrl = stored.bv_site_url;
    config.apiKey = stored.bv_api_key;
    showMain();
  } else {
    showSetup();
  }

  document.getElementById('setup-save').addEventListener('click', saveSetup);
  document.getElementById('btn-collect').addEventListener('click', collectAll);
  document.getElementById('btn-done').addEventListener('click', () => {
    document.getElementById('results').classList.remove('active');
    document.getElementById('btn-collect').disabled = false;
    document.getElementById('btn-collect').innerHTML = '<span style="font-size:20px;">⚡</span> เก็บเสียงลูกค้าทั้งโพสต์';
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    chrome.storage.local.remove(['bv_site_url', 'bv_api_key']);
    config = { siteUrl: '', apiKey: '' };
    showSetup();
  });
});

// ─── Setup ───
function showSetup() {
  document.getElementById('setup-screen').style.display = 'block';
  document.getElementById('main-screen').classList.remove('active');
  document.getElementById('settings-bar').style.display = 'none';
}

async function saveSetup() {
  const url = document.getElementById('setup-url').value.trim().replace(/\/+$/, '');
  const key = document.getElementById('setup-key').value.trim();
  if (!url || !key) return alert('กรุณากรอกข้อมูลให้ครบ');

  try {
    const resp = await fetch(url + '/wp-json/brand-voice/v1/meta', {
      headers: { 'X-BV-API-Key': key },
    });
    if (!resp.ok) throw new Error('API Key ไม่ถูกต้อง');
  } catch (e) {
    return alert('เชื่อมต่อไม่สำเร็จ: ' + e.message);
  }

  config.siteUrl = url;
  config.apiKey = key;
  await chrome.storage.local.set({ bv_site_url: url, bv_api_key: key });
  showMain();
}

// ─── Main ───
async function showMain() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('main-screen').classList.add('active');
  document.getElementById('settings-bar').style.display = 'flex';
  document.getElementById('conn-status').textContent = '● ' + config.siteUrl.replace(/https?:\/\//, '');

  // Get page info from content script (inject if needed)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageData' });
    } catch (e) {
      // Content script ยังไม่ inject (FB SPA navigate / เพิ่งติดตั้ง) — inject ใหม่
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      // รอ script โหลด
      await new Promise(r => setTimeout(r, 500));
      resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageData' });
    }

    if (resp) {
      pageData = resp;
      const icon = PLAT_ICONS[resp.platform] || '🌐';
      const name = PLAT_NAMES[resp.platform] || resp.platform;
      document.getElementById('source-plat').textContent = icon + ' ' + (resp.sourceName || name);
      const info = resp.commentCount > 0
        ? 'พบ ~' + resp.commentCount + ' comments — กดปุ่มเพื่อเก็บทั้งหมด'
        : 'กดปุ่มเพื่อเก็บ Post + Comments ทั้งหมด';
      document.getElementById('source-info').textContent = info;
    }
  } catch (e) {
    document.getElementById('source-plat').textContent = '🌐 หน้านี้ไม่รองรับ';
    document.getElementById('source-info').textContent = 'เปิด Facebook/YouTube/TikTok/Pantip แล้วลองใหม่';
    document.getElementById('btn-collect').disabled = true;
  }
}

// ─── Collect All: One Click ───
async function collectAll() {
  const btn = document.getElementById('btn-collect');
  const progress = document.getElementById('progress');
  const results = document.getElementById('results');

  btn.disabled = true;
  btn.textContent = 'กำลังทำงาน...';
  progress.classList.add('active');
  results.classList.remove('active');
  setProgress(10, 'กำลังอ่าน Post + Comments...');

  // Step 1: Extract post + comments from page
  let fullData;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return showError('ไม่พบ tab ที่เปิดอยู่');

    try {
      fullData = await chrome.tabs.sendMessage(tab.id, { action: 'getFullPost' });
    } catch (e) {
      // Content script ไม่ตอบ — inject ใหม่แล้วลองอีกครั้ง
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await new Promise(r => setTimeout(r, 500));
      fullData = await chrome.tabs.sendMessage(tab.id, { action: 'getFullPost' });
    }
  } catch (e) {
    return showError('ไม่สามารถอ่านหน้าเว็บได้ — ลอง refresh หน้าแล้วกดใหม่');
  }

  if (!fullData || (!fullData.post && (!fullData.comments || fullData.comments.length === 0) && !fullData.rawText)) {
    return showError('ไม่พบข้อมูล Post หรือ Comments ในหน้านี้');
  }

  // Cap comments at 40
  if (fullData.comments && fullData.comments.length > 40) {
    fullData.comments = fullData.comments.slice(0, 40);
  }

  const hasRawText = fullData.rawText && fullData.rawText.length > 20;
  const totalItems = hasRawText
    ? 'raw text'
    : ((fullData.post ? 1 : 0) + (fullData.comments ? fullData.comments.length : 0)) + ' ข้อความ';
  setProgress(30, 'พบ ' + totalItems + ' — กำลังส่ง AI วิเคราะห์ (รอ 15-30 วินาที)...');

  // Step 2: Send to AI bulk endpoint with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout

  try {
    const resp = await fetch(config.siteUrl + '/wp-json/brand-voice/v1/entries/ai-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BV-API-Key': config.apiKey,
      },
      body: JSON.stringify({
        url: fullData.url,
        platform: fullData.platform,
        source_name: fullData.sourceName,
        post: fullData.post,
        comments: fullData.comments,
        raw_text: fullData.rawText || '',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    setProgress(80, 'AI วิเคราะห์เสร็จ — กำลังบันทึก...');

    let data;
    try {
      data = await resp.json();
    } catch (e) {
      return showError('Server ตอบกลับไม่ใช่ JSON — อาจ timeout หรือ server error');
    }

    if (!resp.ok || !data.success) {
      return showError(data.message || 'เกิดข้อผิดพลาด (HTTP ' + resp.status + ')');
    }

    setProgress(100, 'เสร็จ!');

    setTimeout(() => {
      progress.classList.remove('active');
      showResults(data, fullData);
    }, 500);

  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      showError('Timeout — AI ใช้เวลานานเกินไป ลองลด comments แล้วกดใหม่');
    } else {
      showError('เชื่อมต่อไม่ได้: ' + e.message);
    }
  }
}

function setProgress(pct, text) {
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = text;
}

function showError(msg) {
  document.getElementById('progress').classList.remove('active');
  document.getElementById('progress-bar').style.width = '0%';
  const results = document.getElementById('results');
  results.classList.add('active');
  document.getElementById('result-summary').className = 'result-summary error';
  document.getElementById('result-num').textContent = '✗';
  document.getElementById('result-num').style.color = '#dc2626';
  document.getElementById('result-label').textContent = msg;
  document.getElementById('result-list').innerHTML = '';
  document.getElementById('btn-collect').disabled = false;
  document.getElementById('btn-collect').innerHTML = '<span style="font-size:20px;">⚡</span> ลองใหม่';
}

function showResults(data, fullData) {
  const results = document.getElementById('results');
  results.classList.add('active');

  document.getElementById('result-summary').className = 'result-summary';
  document.getElementById('result-num').style.color = '#16a34a';
  document.getElementById('result-num').textContent = data.saved;
  document.getElementById('result-label').textContent =
    'entries บันทึกสำเร็จ' + (data.skipped > 0 ? ' (' + data.skipped + ' ข้ามเพราะไม่เกี่ยวข้อง)' : '');

  // Build items list combining original data + AI results
  const allItems = [];
  if (fullData.post) allItems.push({ type: 'post', ...fullData.post });
  fullData.comments.forEach(c => allItems.push({ type: 'comment', ...c }));

  const listEl = document.getElementById('result-list');
  let html = '';

  (data.results || []).forEach(r => {
    const item = allItems[r.index] || {};
    const icon = r.status === 'created' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';

    html += '<div class="result-item">';
    html += '<div class="result-icon">' + icon + '</div>';
    html += '<div class="result-text">';
    html += '<div class="result-author">' + escHtml(item.author || 'ไม่ระบุชื่อ') + '</div>';
    html += '<div class="result-summary-text">' + escHtml((item.text || '').substring(0, 80)) + '</div>';

    if (r.status === 'created') {
      html += '<div class="result-badges">';
      // Sentiment badge
      const [cls, label] = SENT_BADGE[r.sentiment] || SENT_BADGE.neutral;
      html += '<span class="badge ' + cls + '">' + label + '</span>';
      // Brand badges
      (r.brands || []).forEach(b => {
        html += '<span class="badge badge-brand">' + escHtml(b) + '</span>';
      });
      html += '</div>';
    } else if (r.status === 'skipped') {
      html += '<div class="result-badges"><span class="badge badge-skip">ข้าม — ไม่เกี่ยวข้อง</span></div>';
    }

    html += '</div></div>';
  });

  listEl.innerHTML = html;

  document.getElementById('btn-collect').disabled = false;
  document.getElementById('btn-collect').innerHTML = '<span style="font-size:20px;">⚡</span> เก็บเสียงลูกค้าทั้งโพสต์';
}

function escHtml(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
