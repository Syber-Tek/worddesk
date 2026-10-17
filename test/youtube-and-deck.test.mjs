import assert from 'node:assert/strict';
import { extractYouTubeId } from '../src/lib/youtube.js';

// 1. YouTube ID extraction tests
const cases = [
  { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  { input: 'https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ&t=10s', expected: 'dQw4w9WgXcQ' },
  { input: 'https://youtu.be/dQw4w9WgXcQ?si=123', expected: 'dQw4w9WgXcQ' },
  { input: 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', expected: 'dQw4w9WgXcQ' },
  { input: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  { input: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  { input: 'dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  { input: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
  { input: 'https://example.com/not-youtube-video', expected: null },
  { input: 'not_a_valid_youtube_video_link', expected: null },
  { input: 'too_short', expected: null },
  { input: '', expected: null },
];

for (const c of cases) {
  const result = extractYouTubeId(c.input);
  assert.equal(result, c.expected, `extractYouTubeId("${c.input}") returned "${result}", expected "${c.expected}"`);
}

console.log('youtube-and-deck: all assertions passed');
