process.env.SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || 'arn:aws:sns:us-east-2:111122223333:resume-mailer';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp, highlight, renderResume, emailResumeLink, makeLimiter, EMAIL_PATTERN } = require('../app.js');

const ID = 'a'.repeat(32);
const RESUME = {
  name: 'Ada <b>Student</b>',
  contact: ['ada@example.edu'],
  keywords: ['Python', 'AWS'],
  sections: [{ title: 'EXPERIENCE', lines: ['Skills: <script>alert(1)</script> Python'], entries: [{ heading: 'Acme', location: 'Chicago, IL', subheading: 'Intern', dates: '2025', bullets: ['Built Python tools on AWS'] }] }],
};

function fakeSns(existing = []) {
  const state = { subs: [...existing], subscribed: [], published: [] };
  state.send = async (command) => {
    const name = command.constructor.name;
    if (name === 'ListSubscriptionsByTopicCommand') return { Subscriptions: state.subs };
    if (name === 'SubscribeCommand') { state.subscribed.push(command.input); return {}; }
    if (name === 'PublishCommand') { state.published.push(command.input); return {}; }
    throw new Error(`unexpected ${name}`);
  };
  return state;
}

function s3With(resume) {
  return { send: async () => {
    if (!resume) { const error = new Error('denied'); error.name = 'AccessDenied'; throw error; }
    return { Body: { transformToString: async () => JSON.stringify(resume) } };
  } };
}

async function request(app, method, path, body) {
  const server = await new Promise((resolve) => { const instance = app.listen(0, () => resolve(instance)); });
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ port: server.address().port, method, path, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', reject);
      req.end(body);
    });
  } finally { server.close(); }
}

const presign = async (client, command, seconds) => `https://signed.example/${command.input.Key}?ttl=${seconds}`;

test('highlight escapes input and bolds whole keywords', () => assert.strictEqual(highlight('Used python & JavaScript', ['Python', 'Java']), 'Used <strong>python</strong> &amp; JavaScript'));
test('renderResume prevents HTML injection', () => {
  const html = renderResume(RESUME);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>Student'));
  assert.match(html, /&lt;script&gt;/);
});
test('email pattern accepts valid addresses', () => assert.ok(EMAIL_PATTERN.test('first.last+tag@school.edu')));
test('email pattern rejects invalid addresses', () => assert.ok(!EMAIL_PATTERN.test('not-an-email')));
test('new email requests confirmation only', async () => {
  const sns = fakeSns();
  assert.strictEqual(await emailResumeLink(sns, 'a@b.com', 'https://x'), 'confirmation_requested');
  assert.strictEqual(sns.published.length, 0);
  assert.deepStrictEqual(JSON.parse(sns.subscribed[0].Attributes.FilterPolicy), { recipient: ['a@b.com'] });
});
test('pending email does not publish', async () => {
  const sns = fakeSns([{ Protocol: 'email', Endpoint: 'A@B.com', SubscriptionArn: 'PendingConfirmation' }]);
  assert.strictEqual(await emailResumeLink(sns, 'a@b.com', 'https://x'), 'waiting_for_confirmation');
  assert.strictEqual(sns.published.length, 0);
});
test('confirmed email receives an addressed message', async () => {
  const sns = fakeSns([{ Protocol: 'email', Endpoint: 'a@b.com', SubscriptionArn: 'arn:aws:sns:x:1:t:abc' }]);
  assert.strictEqual(await emailResumeLink(sns, 'a@b.com', 'https://download'), 'sent');
  assert.deepStrictEqual(sns.published[0].MessageAttributes.recipient, { DataType: 'String', StringValue: 'a@b.com' });
});
test('limiter blocks the seventh request', () => {
  const allow = makeLimiter(6, 3600000);
  for (let i = 0; i < 6; i += 1) assert.ok(allow('ip', i));
  assert.ok(!allow('ip', 10));
});
test('bad ids are rejected before S3', async () => assert.strictEqual((await request(createApp({ s3: s3With(RESUME), sns: fakeSns(), presign }), 'GET', '/resume/short')).status, 404));
test('missing and existing resumes have correct status', async () => {
  assert.strictEqual((await request(createApp({ s3: s3With(null), sns: fakeSns(), presign }), 'GET', `/resume/${ID}`)).status, 404);
  const found = await request(createApp({ s3: s3With(RESUME), sns: fakeSns(), presign }), 'GET', `/resume/${ID}`);
  assert.strictEqual(found.status, 200);
  assert.match(found.body, /Download \.docx/);
});
test('download redirects to a five-minute link', async () => {
  const result = await request(createApp({ s3: s3With(RESUME), sns: fakeSns(), presign }), 'GET', `/resume/${ID}/download`);
  assert.strictEqual(result.status, 302);
  assert.match(result.headers.location, /ttl=300/);
});
test('email publishes a one-hour link', async () => {
  const sns = fakeSns([{ Protocol: 'email', Endpoint: 'a@b.com', SubscriptionArn: 'arn:aws:sns:x:1:t:abc' }]);
  const result = await request(createApp({ s3: s3With(RESUME), sns, presign }), 'POST', `/resume/${ID}/email`, 'email=A%40B.com');
  assert.strictEqual(result.status, 200);
  assert.match(sns.published[0].Message, /ttl=3600/);
});
test('invalid email is rejected without SNS', async () => {
  const sns = fakeSns();
  const result = await request(createApp({ s3: s3With(RESUME), sns, presign }), 'POST', `/resume/${ID}/email`, 'email=nope');
  assert.strictEqual(result.status, 400);
  assert.strictEqual(sns.subscribed.length + sns.published.length, 0);
});
