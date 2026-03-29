/**
 * DINOCO Brand Voice — Content Script V.2.0
 * ดึงทั้ง Post + ทุก Comment อัตโนมัติจาก Facebook, YouTube, TikTok, Pantip, IG
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getPageData') {
    sendResponse(extractPageData());
  }
  if (msg.action === 'getFullPost') {
    const result = extractFullPost();
    sendResponse(result);
  }
});

// ─── Basic page data (for source bar) ───
function extractPageData() {
  return {
    url: window.location.href,
    pageTitle: document.title,
    platform: detectPlatform(window.location.href),
    sourceName: getSourceName(),
    commentCount: countVisibleComments(),
  };
}

// ─── Full extraction: Post + ALL Comments ───
function extractFullPost() {
  const url = window.location.href;
  const platform = detectPlatform(url);

  const result = {
    url,
    platform,
    sourceName: getSourceName(),
    post: null,
    comments: [],
  };

  try {
    if (url.includes('facebook.com')) {
      extractFacebookFull(result);
    } else if (url.includes('youtube.com')) {
      extractYouTubeFull(result);
    } else if (url.includes('tiktok.com')) {
      extractTikTokFull(result);
    } else if (url.includes('pantip.com')) {
      extractPantipFull(result);
    } else if (url.includes('instagram.com')) {
      extractInstagramFull(result);
    }
  } catch (e) {
    result.error = 'Extraction failed: ' + e.message;
  }

  return result;
}

function detectPlatform(url) {
  if (url.includes('facebook.com/groups/'))  return 'facebook_group';
  if (url.includes('facebook.com'))          return 'facebook_page';
  if (url.includes('youtube.com'))           return 'youtube';
  if (url.includes('tiktok.com'))            return 'tiktok';
  if (url.includes('pantip.com'))            return 'pantip';
  if (url.includes('instagram.com'))         return 'instagram';
  return 'other';
}

function getSourceName() {
  const url = window.location.href;
  if (url.includes('facebook.com')) {
    // Try group name
    const groupEl = document.querySelector('h1 a[href*="/groups/"]');
    if (groupEl) return groupEl.textContent.trim();
    return document.title.replace(/ \| Facebook$/, '').replace(/ - .+$/, '');
  }
  if (url.includes('youtube.com')) {
    const ch = document.querySelector('#owner #channel-name a, #upload-info #channel-name a');
    return ch ? ch.textContent.trim() : 'YouTube';
  }
  if (url.includes('pantip.com')) return 'Pantip';
  if (url.includes('tiktok.com')) return 'TikTok';
  return document.title;
}

function countVisibleComments() {
  if (location.href.includes('facebook.com')) {
    // FB: count comment blocks
    const commentBlocks = document.querySelectorAll('[role="article"]');
    return Math.max(0, commentBlocks.length - 1); // minus the main post
  }
  return 0;
}

// ─── Facebook: Post + Comments ───
// Strategy: DOM extraction ก่อน (scope ถูก container) + raw text เป็น fallback
function extractFacebookFull(result) {
  // หา container — dialog หรือ permalink page
  let container = document.querySelector('[role="dialog"]');
  if (!container) {
    const url = window.location.href;
    if (url.includes('/permalink/') || url.includes('/posts/') || url.includes('multi_permalinks=')) {
      container = document.querySelector('[role="main"]');
    }
  }
  if (!container) return;

  // ดึง group name
  const title = document.title;
  const titleMatch = title.match(/^(.+?)\s*[·|]/);
  if (titleMatch) result.sourceName = titleMatch[1].trim();

  // ── Step 1: DOM extraction — หา [role="article"] ภายใน container ──
  const articles = container.querySelectorAll('[role="article"]');
  const seen = new Set();

  if (articles.length > 0) {
    articles.forEach((el, idx) => {
      // หา author ก่อน
      let author = '';
      const authorEl = el.querySelector('a[role="link"] > span > span')
        || el.querySelector('a[role="link"] span:first-child')
        || el.querySelector('h3 strong a span, h2 strong a span, h4 strong a span');
      if (authorEl) author = authorEl.textContent.trim();

      // หา text — ใช้ innerText ของ article ทั้งก้อน แล้วตัด noise + author ออก
      let rawArticle = el.innerText || '';
      let lines = rawArticle.split('\n')
        .map(l => l.trim())
        .filter(l => {
          if (l.length < 2) return false;
          if (isFbNoise(l)) return false;
          // ตัด author name ที่ซ้ำ (FB ใส่ชื่อซ้ำหลายจุด)
          if (author && l === author) return false;
          // ตัด timestamp patterns
          if (/^\d+\s*(ชม\.|ชั่วโมง|วัน|นาที|สัปดาห์|hr|min|d|w|สัปดาห์)/i.test(l)) return false;
          // ตัดชื่อกลุ่ม/page ที่ซ้ำ
          if (l === result.sourceName) return false;
          return true;
        });

      // ตัด reply-to pattern (ชื่อคนที่ตอบ ที่อยู่ต้นข้อความ)
      if (lines.length > 0) {
        // ถ้าบรรทัดแรกเป็นชื่อคนอื่น (tag reply) ตัดออก
        const firstLine = lines[0];
        if (firstLine.length < 50 && !firstLine.includes(' ') && firstLine !== author) {
          // อาจเป็นชื่อคนที่ reply — เก็บไว้ใน text ก็ได้ ไม่ตัด
        }
      }

      let text = lines.join('\n').trim();
      if (!text || text.length < 2) return;

      // Dedup — ใช้ author + text เพื่อไม่ตัดข้อความสั้นที่ต่างคนพูด
      const key = (author || 'anon') + '|' + text.substring(0, 60);
      if (seen.has(key)) return;
      seen.add(key);

      // โพสต์แรก = original post, ที่เหลือ = comments
      if (idx === 0 && !result.post) {
        result.post = { author, text, hasPhoto: !!el.querySelector('img[src*="scontent"], video') };
      } else {
        result.comments.push({ author, text });
      }
    });
  }

  // ── Step 2: Fallback — ถ้า DOM ดึงไม่ได้ ส่ง raw text ──
  if (!result.post && result.comments.length === 0) {
    const cleaned = cleanFbText(container.innerText);
    if (cleaned.length > 30) {
      result.rawText = cleaned;
      result.extractionMethod = 'raw_fallback';
    }
  }
}

function isFbNoise(t) {
  return /^(ถูกใจ|แชร์|ตอบกลับ|ดูการตอบกลับ|แสดง|ซ่อน|เกี่ยวข้อง|เพิ่มความคิดเห็น|เขียนความคิดเห็น|Like|Share|Reply|Comments?|ดูเพิ่มเติม|เกี่ยวข้องมากที่สุด|ล่าสุด|ดูความคิดเห็นทั้งหมด|ตอบในชื่อ|ดูคำตอบ|Most relevant|All comments|ติดตาม|ความคิดเห็นทั้งหมด|แสดงความคิดเห็น|รักเลย)$/i.test(t.trim())
    || /^\d+\s*(ชม\.|ชั่วโมง|วัน|นาที|สัปดาห์|ความคิดเห็น|คน|คำตอบ|hr|hours?|min|d|w|สัปดาห์)\.?$/i.test(t.trim())
    || /^·\s*$/.test(t.trim())
    || /^\d+\s*(ชม|วัน|นาที|สัปดาห์)$/.test(t.trim())
    || /^(ดูการตอบกลับทั้ง|ดูตอบกลับ|ดู)\s*\d+/.test(t.trim());
}

function cleanFbText(raw) {
  return raw.split('\n')
    .filter(l => l.trim().length >= 2 && !isFbNoise(l))
    .join('\n')
    .substring(0, 5000);
}

// ─── YouTube: Video title + Comments ───
function extractYouTubeFull(result) {
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1');
  const channelEl = document.querySelector('#owner #channel-name a');

  result.post = {
    author: channelEl ? channelEl.textContent.trim() : '',
    text: titleEl ? titleEl.textContent.trim() : document.title,
    hasPhoto: true,
  };

  // YouTube comments
  const commentEls = document.querySelectorAll('ytd-comment-thread-renderer');
  commentEls.forEach(el => {
    const authorEl = el.querySelector('#author-text');
    const textEl = el.querySelector('#content-text');
    if (textEl) {
      result.comments.push({
        author: authorEl ? authorEl.textContent.trim() : '',
        text: textEl.textContent.trim(),
      });
    }
  });
}

// ─── TikTok: Caption + Comments ───
function extractTikTokFull(result) {
  const captionEl = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"]');
  const authorEl = document.querySelector('[data-e2e="browse-username"], h3[data-e2e="video-author-uniqueid"]');

  result.post = {
    author: authorEl ? authorEl.textContent.trim() : '',
    text: captionEl ? captionEl.textContent.trim() : '',
    hasPhoto: true,
  };

  const commentEls = document.querySelectorAll('[data-e2e="comment-level-1"]');
  commentEls.forEach(el => {
    const userEl = el.querySelector('[data-e2e="comment-username-1"]');
    const textEl = el.querySelector('[data-e2e="comment-level-1"] > div > span');
    if (textEl) {
      result.comments.push({
        author: userEl ? userEl.textContent.trim() : '',
        text: textEl.textContent.trim(),
      });
    }
  });
}

// ─── Pantip: Topic + Comments ───
function extractPantipFull(result) {
  const titleEl = document.querySelector('.display-post-title h2');
  const bodyEl = document.querySelector('.display-post-story');
  const authorEl = document.querySelector('.display-post-name a');

  result.post = {
    author: authorEl ? authorEl.textContent.trim() : '',
    text: (titleEl ? titleEl.textContent.trim() + '\n' : '') + (bodyEl ? bodyEl.textContent.trim() : ''),
    hasPhoto: !!document.querySelector('.display-post-story img'),
  };

  const commentEls = document.querySelectorAll('.display-comment');
  commentEls.forEach(el => {
    const userEl = el.querySelector('.display-post-name a');
    const textEl = el.querySelector('.display-post-story');
    if (textEl) {
      result.comments.push({
        author: userEl ? userEl.textContent.trim() : '',
        text: textEl.textContent.trim(),
      });
    }
  });
}

// ─── Instagram: Post + Comments ───
function extractInstagramFull(result) {
  result.post = {
    author: '',
    text: '',
    hasPhoto: true,
  };

  // IG caption
  const captionEl = document.querySelector('h1[dir="auto"]')
    || document.querySelector('span[dir="auto"]');
  if (captionEl) result.post.text = captionEl.textContent.trim();

  // IG author
  const authorEl = document.querySelector('header a[href*="/"]');
  if (authorEl) result.post.author = authorEl.textContent.trim();

  // IG comments
  const commentEls = document.querySelectorAll('ul > li[role="menuitem"], ul > div > li');
  commentEls.forEach(el => {
    const userEl = el.querySelector('a[href*="/"]');
    const textEl = el.querySelector('span[dir="auto"]');
    if (textEl && textEl.textContent.trim().length > 2) {
      result.comments.push({
        author: userEl ? userEl.textContent.trim() : '',
        text: textEl.textContent.trim(),
      });
    }
  });
}
