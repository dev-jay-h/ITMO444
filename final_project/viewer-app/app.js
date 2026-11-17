const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const {
  SNSClient,
  ListSubscriptionsByTopicCommand,
  SubscribeCommand,
  PublishCommand,
} = require('@aws-sdk/client-sns');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const PORT = Number(process.env.PORT || 3000);
const REGION = process.env.AWS_REGION || 'us-east-2';
const BUCKET = process.env.BUCKET_NAME || '';
const TOPIC_ARN = process.env.SNS_TOPIC_ARN || '';
const ID_PATTERN = /^[a-f0-9]{32}$/;
const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@"]+$/;
const DOWNLOAD_SECONDS = 300;
const LINK_SECONDS = 3600;

function log(event, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...details }));
}

function makeLimiter(max, windowMs) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, keywords) {
  const usable = (keywords || []).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!usable.length) return esc(text);
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${usable.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  let output = '';
  let cursor = 0;
  for (const match of String(text).matchAll(pattern)) {
    const start = match.index + match[1].length;
    output += esc(String(text).slice(cursor, start));
    output += `<strong>${esc(String(text).slice(start, start + match[2].length))}</strong>`;
    cursor = start + match[2].length;
  }
  return output + esc(String(text).slice(cursor));
}

function renderResume(resume) {
  const parts = [`<main class="resume"><h1>${esc(resume.name)}</h1><p class="contact">${(resume.contact || []).map(esc).join(' | ')}</p>`];
  for (const section of resume.sections || []) {
    parts.push(`<h2>${esc(section.title)}</h2>`);
    for (const entry of section.entries || []) {
      parts.push(`<div class="row"><strong>${highlight(entry.heading, resume.keywords)}</strong><span>${highlight(entry.location, resume.keywords)}</span></div>`);
      parts.push(`<div class="row"><em>${highlight(entry.subheading, resume.keywords)}</em><span>${highlight(entry.dates, resume.keywords)}</span></div>`);
      if ((entry.bullets || []).length) {
        parts.push(`<ul>${entry.bullets.map((bullet) => `<li>${highlight(bullet, resume.keywords)}</li>`).join('')}</ul>`);
      }
    }
    for (const line of section.lines || []) parts.push(`<p>${highlight(line, resume.keywords)}</p>`);
  }
  parts.push('</main>');
  return parts.join('');
}

async function findSubscription(sns, email) {
  let token;
  do {
    const page = await sns.send(new ListSubscriptionsByTopicCommand({ TopicArn: TOPIC_ARN, NextToken: token }));
    const found = (page.Subscriptions || []).find((sub) => sub.Protocol === 'email' && String(sub.Endpoint).toLowerCase() === email);
    if (found) return found;
    token = page.NextToken;
  } while (token);
  return null;
}

async function emailResumeLink(sns, email, url) {
  email = email.trim().toLowerCase();
  const existing = await findSubscription(sns, email);
  if (!existing) {
    await sns.send(new SubscribeCommand({
      TopicArn: TOPIC_ARN,
      Protocol: 'email',
      Endpoint: email,
      ReturnSubscriptionArn: true,
      Attributes: { FilterPolicy: JSON.stringify({ recipient: [email] }) },
    }));
    return 'confirmation_requested';
  }
  if (existing.SubscriptionArn === 'PendingConfirmation') return 'waiting_for_confirmation';
  await sns.send(new PublishCommand({
    TopicArn: TOPIC_ARN,
    Subject: 'Your tailored resume is ready',
    Message: `Your tailored resume is ready. Download it within one hour:\n\n${url}\n\nAnyone with this link can download the file until it expires.`,
    MessageAttributes: { recipient: { DataType: 'String', StringValue: email } },
  }));
  return 'sent';
}

function simplePage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;background:#eee;color:#111;margin:0;padding:2rem}.shell{max-width:850px;margin:auto}.resume{background:#fff;padding:.6in;box-shadow:0 2px 14px #bbb}.resume h1{text-align:center;margin:0}.contact{text-align:center}.resume h2{font-size:1rem;border-bottom:1px solid #111;margin-top:1rem}.row{display:flex;justify-content:space-between;gap:1rem}.actions{background:#fff;padding:1rem;margin-top:1rem}input,button{font:inherit;padding:.5rem}.message{font-weight:700}.error{color:#9b1c1c}@media print{body{background:#fff;padding:0}.actions{display:none}.resume{box-shadow:none}}</style></head><body><div class="shell">${body}</div></body></html>`;
}

function createApp(deps = {}) {
  const s3 = deps.s3 || new S3Client({ region: REGION });
  const sns = deps.sns || new SNSClient({ region: REGION });
  const presign = deps.presign || ((client, command, seconds) => getSignedUrl(client, command, { expiresIn: seconds }));
  const emailLimit = makeLimiter(6, 60 * 60 * 1000);
  const app = express();
  app.set('trust proxy', true);
  app.use(express.urlencoded({ extended: false, limit: '2kb' }));

  async function loadResume(id) {
    try {
      const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `resumes/${id}.json` }));
      return JSON.parse(await response.Body.transformToString());
    } catch (error) {
      if (['NoSuchKey', 'AccessDenied', 'NotFound'].includes(error.name)) return null;
      throw error;
    }
  }

  const docxUrl = (id, seconds) => presign(s3, new GetObjectCommand({ Bucket: BUCKET, Key: `resumes/${id}.docx` }), seconds);

  async function show(req, res, id, message = '', isError = false) {
    if (!ID_PATTERN.test(id)) return res.status(404).send(simplePage('Not found', '<p>That resume does not exist or has expired.</p>'));
    const resume = await loadResume(id);
    if (!resume) return res.status(404).send(simplePage('Not found', '<p>That resume does not exist or has expired.</p>'));
    const messageHtml = message ? `<p class="message${isError ? ' error' : ''}">${esc(message)}</p>` : '';
    return res.send(simplePage(resume.name, `${renderResume(resume)}<section class="actions"><p><a href="/resume/${id}/download">Download .docx</a></p><form method="post" action="/resume/${id}/email"><label>Email address <input type="email" name="email" required></label> <button type="submit">Send</button></form>${messageHtml}</section>`));
  }

  app.get('/', (req, res) => res.send(simplePage('Resume viewer', '<h1>Resume viewer</h1><p>Build a resume first on the uploader page.</p>')));
  app.get('/resume/:id', (req, res) => show(req, res, req.params.id).catch((error) => {
    log('error', { stage: 'view', message: `${error.name}: ${error.message}` });
    res.status(502).send(simplePage('Error', '<p class="error">The resume could not be loaded. Please try again.</p>'));
  }));
  app.get('/resume/:id/download', async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(404).send(simplePage('Not found', '<p>That resume does not exist or has expired.</p>'));
    res.redirect(await docxUrl(req.params.id, DOWNLOAD_SECONDS));
  });
  app.post('/resume/:id/email', async (req, res) => {
    const id = req.params.id;
    try {
      if (!ID_PATTERN.test(id)) return res.status(404).send(simplePage('Not found', '<p>That resume does not exist or has expired.</p>'));
      const email = String(req.body.email || '').trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        res.statusCode = 400;
        return show(req, res, id, 'Please enter a valid email address.', true);
      }
      if (!emailLimit(req.ip)) {
        res.statusCode = 429;
        return show(req, res, id, 'Too many email requests. Please try again later.', true);
      }
      const url = await docxUrl(id, LINK_SECONDS);
      const result = await emailResumeLink(sns, email, url);
      log('email_request', { result });
      const messages = {
        sent: `Sent. Check the inbox of ${email} (and the spam folder) for a message from Amazon SNS.`,
        confirmation_requested: `We asked Amazon SNS to confirm ${email}. Open that email, click "Confirm subscription", then press Send again here.`,
        waiting_for_confirmation: `${email} has not been confirmed yet. Open the confirmation email from Amazon SNS, click "Confirm subscription", then press Send again.`,
      };
      return show(req, res, id, messages[result]);
    } catch (error) {
      log('error', { stage: 'email', message: `${error.name}: ${error.message}` });
      res.statusCode = 502;
      return show(req, res, id, 'The email could not be sent. Please try again in a minute.', true)
        .catch(() => res.status(500).end());
    }
  });
  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => log('viewer_started', { port: PORT, topic: TOPIC_ARN }));
}

module.exports = { createApp, highlight, renderResume, emailResumeLink, makeLimiter, EMAIL_PATTERN };
