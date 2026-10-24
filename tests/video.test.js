import test from 'node:test';
import assert from 'node:assert/strict';
import { embedFor, splitLinks } from '../js/video.js';

test('YouTube links of every shape play in the app', () => {
  const src = (l) => embedFor(l)?.src.split('?')[0];
  for (const l of ['https://youtu.be/JN9DVjlafcg', 'https://www.youtube.com/watch?v=JN9DVjlafcg&si=x', 'https://m.youtube.com/watch?v=JN9DVjlafcg', 'https://youtube.com/embed/JN9DVjlafcg']) {
    assert.equal(src(l), 'https://www.youtube-nocookie.com/embed/JN9DVjlafcg', l);
  }
  const short = embedFor('https://youtube.com/shorts/gjMYET5fT5k?feature=share');
  assert.equal(short.tall, true);
  assert.match(short.src, /embed\/gjMYET5fT5k\?/);
  assert.match(embedFor('https://youtu.be/JN9DVjlafcg?t=1m30s').src, /start=90/);
});

test('Vimeo, Drive, Loom, Instagram and TikTok links embed', () => {
  assert.match(embedFor('https://vimeo.com/76979871').src, /^https:\/\/player\.vimeo\.com\/video\/76979871\?/);
  assert.match(embedFor('https://vimeo.com/76979871/abc123ef').src, /h=abc123ef/);
  assert.equal(embedFor('https://drive.google.com/file/d/1AbC/view?usp=sharing').src, 'https://drive.google.com/file/d/1AbC/preview');
  assert.match(embedFor('https://www.loom.com/share/abc123').src, /loom\.com\/embed\/abc123/);
  assert.equal(embedFor('https://www.instagram.com/reel/Cxyz/').src, 'https://www.instagram.com/reel/Cxyz/embed');
  assert.equal(embedFor('https://www.tiktok.com/@coach/video/7234567890').src, 'https://www.tiktok.com/embed/v2/7234567890');
  assert.equal(embedFor('https://example.com/clips/squat.mp4').kind, 'file');
});

test('links the app cannot play return null so they open in a new tab', () => {
  for (const l of ['https://example.com/squat', 'https://youtube.com/@channel', 'not a link', '', null, 'javascript:alert(1)']) assert.equal(embedFor(l), null, String(l));
});

test('notes split into text and links, trailing punctuation left as text', () => {
  assert.deepEqual(splitLinks('Demo: https://youtu.be/abc123def. Go slow'), [
    { text: 'Demo: ' }, { url: 'https://youtu.be/abc123def' }, { text: '. Go slow' },
  ]);
  assert.deepEqual(splitLinks('no links'), [{ text: 'no links' }]);
});
