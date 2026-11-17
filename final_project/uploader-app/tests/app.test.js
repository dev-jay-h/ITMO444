const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp, cleanText, parseResume, splitRuns, buildDocx, makeLimiter, UserError, buildPrompt } = require('../app.js');

const JOB = 'We need a developer with Python, AWS and SQL. Experience with C++ is a plus.';
const GOOD = JSON.stringify({
  name: 'Ada Student',
  contact: ['Chicago, IL', 'ada@example.edu'],
  sections: [
    { title: 'education', entries: [{ heading: 'Example University', location: 'Chicago, IL', subheading: 'BS Computer Science', dates: '2022 to 2026', bullets: ['Built a Python tool on AWS'] }], lines: [] },
    { title: 'Skills', entries: [], lines: ['Technical: Python, SQL'] },
  ],
  keywords: ['Python', 'AWS', 'SQL', 'Kubernetes'],
});

test('cleanText normalizes text', () => {
  const value = cleanText(Buffer.from('\ufeffHello\r\nworld\u0007 '.repeat(5)), 'resume');
  assert.ok(value.startsWith('Hello\nworld'));
  assert.ok(!value.includes('\u0007'));
});
test('cleanText rejects short files', () => assert.throws(() => cleanText(Buffer.from('short'), 'resume'), UserError));
test('cleanText rejects binary files', () => assert.throws(() => cleanText(Buffer.from([0, 1, 2, 3]), 'resume'), UserError));
test('cleanText rejects long files', () => assert.throws(() => cleanText(Buffer.from('x'.repeat(30001)), 'resume'), (error) => error.status === 413));
test('parseResume accepts valid output', () => assert.deepStrictEqual(parseResume(GOOD, JOB).sections.map((section) => section.title), ['EDUCATION', 'SKILLS']));
test('parseResume filters absent keywords', () => assert.deepStrictEqual(parseResume(GOOD, JOB).keywords, ['Python', 'AWS', 'SQL']));
test('parseResume accepts a JSON code fence', () => assert.strictEqual(parseResume('```json\n' + GOOD + '\n```', JOB).name, 'Ada Student'));
test('parseResume rejects invalid JSON', () => assert.throws(() => parseResume('not json', JOB), /not_json/));
test('parseResume rejects missing fields', () => {
  assert.throws(() => parseResume('{"name":"A","sections":[]}', JOB), /no_sections/);
  assert.throws(() => parseResume('{"sections":[{"title":"X","lines":["a"]}]}', JOB), /missing_name/);
});
test('parseResume caps lengths', () => {
  const value = parseResume(JSON.stringify({ name: 'N'.repeat(500), sections: [{ title: 'Skills', lines: ['a'.repeat(900), null] }] }), JOB);
  assert.strictEqual(value.name.length, 80);
  assert.strictEqual(value.sections[0].lines[0].length, 300);
});
test('splitRuns matches whole words without case sensitivity', () => {
  const runs = splitRuns('Wrote python and JavaScript, then C++ tools', ['Python', 'Java', 'C++']);
  assert.deepStrictEqual(runs.filter((run) => run.bold).map((run) => run.text), ['python', 'C++']);
  assert.strictEqual(runs.map((run) => run.text).join(''), 'Wrote python and JavaScript, then C++ tools');
});
test('buildDocx creates a zip-based document', async () => {
  const buffer = await buildDocx(parseResume(GOOD, JOB));
  assert.strictEqual(buffer.subarray(0, 2).toString(), 'PK');
  assert.ok(buffer.length > 1000);
});
test('limiter and prompt wrappers work', () => {
  const allow = makeLimiter(2, 1000);
  assert.ok(allow('a', 0));
  assert.ok(allow('a', 1));
  assert.ok(!allow('a', 2));
  assert.ok(allow('a', 1500));
  assert.match(buildPrompt('resume', 'job'), /<resume>\nresume/);
});

