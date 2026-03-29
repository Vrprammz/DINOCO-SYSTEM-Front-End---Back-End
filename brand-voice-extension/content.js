/**
 * DINOCO Brand Voice — Content Script
 * ดึงข้อมูลจาก social media pages (Facebook, YouTube, TikTok, Pantip, Instagram)
 */

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getPageData') {
    sendResponse(extractPageData());
  }
});

function extractPageData() {
  const url = window.location.href;
  const selectedText = window.getSelection().toString().trim();
  const pageTitle = document.title;

  const data = {
    url,
    selectedText,
    pageTitle,
    platform: detectPlatform(url),
    sourceName: '',
    authorName: '',
    hasPhoto: false,
    postDate: new Date().toISOString().slice(0, 10),
  };

  // Platform-specific extraction
  if (url.includes('facebook.com')) {
    extractFacebook(data);
  } else if (url.includes('youtube.com')) {
    extractYouTube(data);
  } else if (url.includes('tiktok.com')) {
    extractTikTok(data);
  } else if (url.includes('pantip.com')) {
    extractPantip(data);
  } else if (url.includes('instagram.com')) {
    extractInstagram(data);
  }

  return data;
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

function extractFacebook(data) {
  // Group name from header
  const groupHeader = document.querySelector('h1 a[href*="/groups/"]');
  if (groupHeader) data.sourceName = groupHeader.textContent.trim();
  if (!data.sourceName) data.sourceName = document.title.replace(/ \| Facebook$/, '');

  // Post author — try multiple selectors
  const authorEl = document.querySelector('[data-ad-rendering-role="profile_name"] a strong span')
    || document.querySelector('h3 strong a span');
  if (authorEl) data.authorName = authorEl.textContent.trim();

  // Photos
  data.hasPhoto = !!document.querySelector('[data-visualcompletion="media-vc-image"] img');
}

function extractYouTube(data) {
  data.sourceName = 'YouTube';
  const channelEl = document.querySelector('#owner #channel-name a')
    || document.querySelector('#upload-info #channel-name a');
  if (channelEl) data.sourceName = channelEl.textContent.trim();

  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')
    || document.querySelector('#title h1');
  if (titleEl) data.authorName = titleEl.textContent.trim();
}

function extractTikTok(data) {
  data.sourceName = 'TikTok';
  const authorEl = document.querySelector('[data-e2e="browse-username"]')
    || document.querySelector('h3[data-e2e="video-author-uniqueid"]');
  if (authorEl) data.authorName = authorEl.textContent.trim();
}

function extractPantip(data) {
  data.sourceName = 'Pantip';
  const titleEl = document.querySelector('.display-post-title h2');
  if (titleEl) data.sourceName = 'Pantip: ' + titleEl.textContent.trim().substring(0, 50);

  const authorEl = document.querySelector('.display-post-name a');
  if (authorEl) data.authorName = authorEl.textContent.trim();
}

function extractInstagram(data) {
  data.sourceName = 'Instagram';
  const authorEl = document.querySelector('header a.x1i10hfl');
  if (authorEl) data.authorName = authorEl.textContent.trim();
  data.hasPhoto = true; // IG always has media
}
