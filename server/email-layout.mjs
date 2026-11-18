// One look for every Digivated email: dark, monospace labels in [ brackets ],
// a single clear button, plain-text twin for every message. Inline styles and
// tables only, so it renders the same in Gmail, Apple Mail and Outlook.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const MONO = "'Courier New',Courier,monospace";
const SANS = 'Arial,Helvetica,sans-serif';

// paragraphs: strings (escaped). list: [{label, href?, note?}]. cta: {label, href}.
export function renderEmail({ label = 'DIGIVATED', title, preheader = '', paragraphs = [], list = [], cta, after = [], footer = [] }) {
  const p = text => `<p style="margin:0 0 16px;color:#c8c8c8;font:15px/1.65 ${SANS}">${escape(text)}</p>`;
  const items = list.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;border-top:1px dashed #2e2e2e">${list.map(item => `<tr><td style="padding:12px 0;border-bottom:1px dashed #2e2e2e;font:15px/1.5 ${SANS}">${item.href ? `<a href="${escape(item.href)}" style="color:#f1f1f1;font-weight:700;text-decoration:none">${escape(item.label)}</a>` : `<span style="color:#f1f1f1;font-weight:700">${escape(item.label)}</span>`}${item.note ? `<br><span style="color:#9a9a9a;font:13px/1.5 ${SANS}">${escape(item.note)}</span>` : ''}</td></tr>`).join('')}</table>` : '';
  const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td bgcolor="#ececec" style="background-color:#ececec;border:1px solid #ececec"><a href="${escape(cta.href)}" style="display:inline-block;padding:12px 20px;color:#0a0a0a;font:700 14px/1 ${SANS};text-decoration:none">${escape(cta.label)} &rarr;</a></td></tr></table>` : '';
  const foot = footer.map(line => typeof line === 'string' ? escape(line) : `<a href="${escape(line.href)}" style="color:#c8c8c8;text-decoration:underline">${escape(line.label)}</a>`).join('<br>');
  const html = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${escape(title)}</title></head>
<body bgcolor="#0b0b0b" style="margin:0;padding:0;background-color:#0b0b0b;color:#e7e7e7">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#0b0b0b">${escape(preheader || title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0b0b" style="background-color:#0b0b0b"><tr><td align="center" style="padding:0 12px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;text-align:left;background-color:#0b0b0b">
<tr><td style="padding:34px 12px 8px"><a href="https://digivated.com/" style="color:#bfc2c5;font:700 12px/1.5 ${MONO};letter-spacing:1.5px;text-decoration:none">[ ${escape(label)} ]</a></td></tr>
<tr><td style="padding:10px 12px 0">
<h1 style="margin:0 0 16px;color:#f4f4f4;font:700 24px/1.3 ${SANS};letter-spacing:-.3px">${escape(title)}</h1>
${paragraphs.map(p).join('')}${items}${button}${after.map(p).join('')}
</td></tr>
<tr><td style="padding:18px 12px 36px"><p style="margin:0 0 14px;padding-top:14px;border-top:1px dashed #2e2e2e;color:#4a4a4a;font:12px/1 ${MONO}">+</p>
<p style="margin:0;color:#8f8f8f;font:12px/1.7 ${SANS}">Digivated &middot; Keep looking forward.${foot ? `<br>${foot}` : ''}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [
    `[ ${label} ]`, title, ...paragraphs,
    ...list.map(item => `- ${item.label}${item.href ? `: ${item.href}` : ''}${item.note ? `\n  ${item.note}` : ''}`),
    ...(cta ? [`${cta.label}: ${cta.href}`] : []), ...after,
    ['Digivated', ...footer.map(line => typeof line === 'string' ? line : `${line.label}: ${line.href}`)].join('\n'),
  ].join('\n\n');
  return { html, text };
}

export async function sendEmail(env, fetcher, { to, subject, html, text, idempotencyKey, headers }) {
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({ from: env.ACCOUNT_EMAIL_FROM, to: [to], subject, html, text, ...(headers ? { headers } : {}) }),
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
  });
  return response.ok;
}
