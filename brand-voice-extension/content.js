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
function extractFacebookFull(result) {
  // Main post content
  const articles = document.querySelectorAll('[role="article"]');

  // Strategy: get all text blocks from the page
  // FB post = first article, comments = subsequent articles

  // Try to get the main post text
  const postTextEl = document.querySelector('[data-ad-comet-preview="message"]')
    || document.querySelector('[data-ad-preview="message"]');

  let postText = '';
  if (postTextEl) {
    postText = postTextEl.innerText.trim();
  }

  // Post author
  let postAuthor = '';
  const authorEl = document.querySelector('h2 a strong span, h3 a strong span, [data-ad-rendering-role="profile_name"] a strong span');
  if (authorEl) postAuthor = authorEl.textContent.trim();

  // If no structured post found, try from title
  if (!postText) {
    // Extract from page title pattern "GroupName · PostContent"
    const title = document.title;
    const match = title.match(/^(.+?)\s*[·|]\s*(.+?)(?:\s*\|.*)?$/);
    if (match) {
      result.sourceName = match[1].trim();
      postText = match[2].trim();
    }
  }

  result.post = {
    author: postAuthor,
    text: postText,
    hasPhoto: !!document.querySelector('[data-visualcompletion="media-vc-image"] img, video'),
  };

  // Comments — scrape all visible comment elements
  // Facebook comments are nested in role="article" elements
  // Each comment has text content and an author
  const commentEls = document.querySelectorAll('ul[role="list"] > li, div[role="article"]');
  const seen = new Set();

  commentEls.forEach(el => {
    // Skip the main post article
    if (el === articles[0]) return;

    // Get comment text — look for the actual comment content spans
    let text = '';
    const textSpans = el.querySelectorAll('[dir="auto"]:not(h2 *, h3 *, h4 *, a[role="link"] *)');
    textSpans.forEach(span => {
      const t = span.innerText.trim();
      if (t && t.length > 1 && !t.match(/^(ถูกใจ|แชร์|ตอบกลับ|\d+\s*(ชม\.|วัน|นาที|สัปดาห์))$/)) {
        text += (text ? '\n' : '') + t;
      }
    });

    if (!text || text.length < 3) return;

    // Get comment author
    let author = '';
    const authorLink = el.querySelector('a[role="link"] span:first-child, a span.x193iq5w');
    if (authorLink) author = authorLink.textContent.trim();

    // Dedup
    const key = author + '|' + text.substring(0, 50);
    if (seen.has(key)) return;
    seen.add(key);

    // Skip noise (like/share buttons text)
    if (text.match(/^(ถูกใจ|แชร์|ดู\s*\d+|แสดง|ซ่อน|ดูเพิ่มเติม|ตอบกลับ)$/i)) return;

    result.comments.push({ author, text });
  });

  // Fallback: if structured extraction failed, send raw text for AI to parse
  if (result.comments.length === 0 && !result.post) {
    const container = document.querySelector('[role="dialog"]') || document.querySelector('[role="main"]');
    if (container) {
      const rawText = container.innerText;
      // ส่งเป็น 1 comment ขนาดใหญ่ ให้ AI ฝั่ง server แยก post/comments เอง
      // ตัด noise พื้นฐานออก แต่ไม่พยายาม parse structure
      const cleaned = rawText.split('\n')
        .filter(l => {
          const t = l.trim();
          if (t.length < 2) return false;
          if (t.match(/^(ถูกใจ|แชร์|ตอบกลับ|ดูการตอบกลับ|แสดง|ซ่อน|เกี่ยวข้อง|เพิ่มความคิดเห็น|Like|Share|Reply|Comments?|เขียนความคิดเห็น)$/i)) return false;
          if (t.match(/^\d+\s*(ชม\.|วัน|นาที|สัปดาห์|ความคิดเห็น|คน|คำตอบ|hr|min|d|w)\.?$/i)) return false;
          if (t.match(/^·\s*$/)) return false;
          return true;
        })
        .join('\n')
        .substring(0, 5000); // cap at 5000 chars

      if (cleaned.length > 20) {
        result.rawText = cleaned;
        result.extractionMethod = 'raw_fallback';
      }
    }
  }
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
