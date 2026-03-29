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
      // หา text content ของ article นี้
      const textEls = el.querySelectorAll('[dir="auto"]');
      let text = '';
      textEls.forEach(span => {
        const t = span.innerText.trim();
        if (t && t.length > 1 && !isFbNoise(t)) {
          text += (text ? '\n' : '') + t;
        }
      });
      if (!text || text.length < 2) return;

      // หา author — ลองหลาย selector
      let author = '';
      const authorEl = el.querySelector('a[role="link"] > span > span')
        || el.querySelector('a[role="link"] span:first-child')
        || el.querySelector('h3 strong a span, h2 strong a span, h4 strong a span');
      if (authorEl) author = authorEl.textContent.trim();

      // Dedup
      const key = text.substring(0, 80);
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
