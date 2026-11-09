import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyYtdlpStderr, validateUrl } from '../extract/ytdlp.js';
import { parseModelJson, classifyGeminiError } from '../extract/gemini.js';
import { coercePrice } from '../extract/price.js';
import { CODES } from '../extract/errors.js';

const COOKIE_HINT = 'Use --cookies-from-browser or --cookies for the authentication.';

test('classifyYtdlpStderr maps yt-dlp failures to specific codes', () => {
  const cases = [
    ['ERROR: [Instagram] abc: This content is only available for registered users who follow this account. ' + COOKIE_HINT, CODES.PRIVATE_POST],
    ['ERROR: [Instagram] abc: There is no video in this post', CODES.NO_VIDEO_IN_POST],
    ['ERROR: [TikTok] 123: Your IP address is blocked from accessing this post', CODES.GEO_OR_IP_BLOCKED],
    ['ERROR: unable to download webpage: HTTP Error 404: Not Found', CODES.POST_UNAVAILABLE],
    ['ERROR: HTTP Error 429: Too Many Requests', CODES.SOURCE_RATE_LIMITED],
    ['ERROR: [Instagram] abc: login required. ' + COOKIE_HINT, CODES.COOKIES_EXPIRED],
  ];
  for (const [stderr, want] of cases) assert.equal(classifyYtdlpStderr(stderr), want, stderr);
});

test('classifyYtdlpStderr prefers the ERROR line over earlier warnings', () => {
  const stderr = [
    'WARNING: [Instagram] The provided Instagram account cookies are no longer valid',
    'ERROR: [Instagram] abc: There is no video in this post',
  ].join('\n');
  assert.equal(classifyYtdlpStderr(stderr), CODES.NO_VIDEO_IN_POST);
  // Warning-only output still classifies from the whole blob.
  assert.equal(classifyYtdlpStderr(stderr.split('\n')[0]), CODES.COOKIES_EXPIRED);
});

test('classifyYtdlpStderr ignores a 429 inside a CDN URL and returns null when nothing matches', () => {
  assert.equal(classifyYtdlpStderr('ERROR: something odd https://cdn.example/x.mp4?_nc_oc=429&y=1'), null);
  assert.equal(classifyYtdlpStderr(''), null);
  assert.equal(classifyYtdlpStderr(undefined), null);
});

test('validateUrl accepts Instagram/TikTok only', () => {
  assert.doesNotThrow(() => validateUrl('https://www.instagram.com/reel/abc/'));
  assert.doesNotThrow(() => validateUrl('https://vm.tiktok.com/xyz/'));
  for (const bad of ['https://youtube.com/watch?v=1', 'https://instagram.com.evil.io/', 'not a url']) {
    assert.throws(() => validateUrl(bad), (e) => e.code === CODES.UNSUPPORTED_URL, bad);
  }
});

test('parseModelJson strips fences and surrounding prose', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseModelJson('Here you go: {"a":{"b":2}} hope that helps'), { a: { b: 2 } });
  assert.throws(() => parseModelJson('no json here'), SyntaxError);
});

test('classifyGeminiError separates rate limits from other failures', () => {
  assert.equal(classifyGeminiError(new Error('[429 Too Many Requests] quota')).code, CODES.RATE_LIMITED);
  assert.equal(classifyGeminiError(new Error('503 Service Unavailable: overloaded')).code, CODES.RATE_LIMITED);
  assert.equal(classifyGeminiError(new Error('400 bad request')).code, CODES.FETCH_FAILED);
});

test('coercePrice keeps sane prices rounded to the cent', () => {
  assert.equal(coercePrice(3.456), 3.46);
  assert.equal(coercePrice('2.5'), 2.5);
  assert.equal(coercePrice(0), null);
  assert.equal(coercePrice(0, { allowZero: true }), 0);
  for (const bad of [-1, 1000, NaN, '', 'abc', true, null, undefined, [1], {}]) {
    assert.equal(coercePrice(bad), null, String(bad));
  }
});
