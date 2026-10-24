// Exercise demo videos: turn a link a coach pastes (YouTube, Vimeo, ...) into
// something the app can play in its own pop-up instead of leaving the page.

// { kind: 'frame' | 'file', src, tall } for links the app can play, or null.
// tall = a phone-shaped (portrait) video such as a YouTube Short.
export function embedFor(link) {
  let u;
  try { u = new URL(String(link || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^(www|m|mobile)\./, '');
  const path = u.pathname.split('/').filter(Boolean);
  const frame = (src, tall = false) => ({ kind: 'frame', src, tall });

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
    let id = host === 'youtu.be' ? path[0] : u.searchParams.get('v');
    const tall = path[0] === 'shorts';
    if (!id && ['shorts', 'embed', 'live', 'v'].includes(path[0])) id = path[1];
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const start = parseStart(u.searchParams.get('t') || u.searchParams.get('start'));
    return frame(`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0${start ? `&start=${start}` : ''}`, tall);
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const nums = path.filter((p) => /^\d+$/.test(p));
    if (!nums.length) return null;
    // Unlisted videos carry a hash after the id: vimeo.com/123/abcdef
    const after = path[path.indexOf(nums[0]) + 1];
    const h = u.searchParams.get('h') || (after && /^[0-9a-f]+$/i.test(after) ? after : '');
    return frame(`https://player.vimeo.com/video/${nums[0]}?autoplay=1&playsinline=1${h ? `&h=${h}` : ''}`);
  }
  if (host === 'drive.google.com') {
    const id = path[0] === 'file' && path[1] === 'd' ? path[2] : u.searchParams.get('id');
    return id ? frame(`https://drive.google.com/file/d/${id}/preview`) : null;
  }
  if (host === 'loom.com' && ['share', 'embed'].includes(path[0]) && path[1]) {
    return frame(`https://www.loom.com/embed/${path[1]}?autoplay=1`);
  }
  if (host === 'instagram.com' && ['p', 'reel', 'reels', 'tv'].includes(path[0]) && path[1]) {
    return frame(`https://www.instagram.com/${path[0] === 'reels' ? 'reel' : path[0]}/${path[1]}/embed`, true);
  }
  if (host === 'tiktok.com') {
    const i = path.indexOf('video');
    if (i >= 0 && /^\d+$/.test(path[i + 1] || '')) return frame(`https://www.tiktok.com/embed/v2/${path[i + 1]}`, true);
    return null;
  }
  if (/\.(mp4|m4v|mov|webm|ogv)$/i.test(u.pathname)) return { kind: 'file', src: u.href, tall: false };
  return null;
}

// "90", "1m30s", "1h2m3s" -> seconds.
function parseStart(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) : 0;
}

// Split text into plain parts and links, so notes can show tappable links.
export function splitLinks(text) {
  const out = [];
  const re = /https?:\/\/[^\s<>"']+/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    const url = m[0].replace(/[).,;:!?]+$/, '');
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ url });
    last = m.index + url.length;
    re.lastIndex = last;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
