/**
 * ===========================================
 * Arthings - Mail Service
 * ===========================================
 *
 * Nodemailer wrapper with a provider-agnostic SMTP transport (Brevo, SES,
 * SendGrid, Gmail — all configured purely through environment variables).
 *
 * When SMTP is not configured the service falls back to logging the message
 * to the console, so local development never blocks on credentials and
 * verification codes stay reachable during testing.
 */

const nodemailer = require('nodemailer');
const config = require('../config/env');

let transport = null;

function getTransport() {
    if (transport) return transport;

    if (config.mail.isConfigured) {
        transport = nodemailer.createTransport({
            host: config.mail.host,
            port: config.mail.port,
            secure: config.mail.secure,
            auth: {
                user: config.mail.user,
                pass: config.mail.password
            }
        });
    } else {
        // `jsonTransport` resolves without sending, letting us print instead.
        transport = nodemailer.createTransport({ jsonTransport: true });
    }

    return transport;
}

/** HTML-escapes interpolated values so user data cannot inject markup. */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Shared responsive shell. Inline styles only — email clients strip <style>.
 */
function layout({ heading, body, actionLabel, actionUrl, footnote }) {
    const action = actionUrl
        ? `<tr><td style="padding:8px 0 24px;">
             <a href="${escapeHtml(actionUrl)}"
                style="display:inline-block;background:#00d1cd;color:#03201f;text-decoration:none;
                       font-weight:600;font-size:15px;padding:13px 28px;border-radius:10px;">
               ${escapeHtml(actionLabel || 'Open Arthings')}
             </a>
           </td></tr>`
        : '';

    const footer = footnote
        ? `<tr><td style="padding-top:8px;color:#6b7280;font-size:13px;line-height:1.6;">
             ${footnote}
           </td></tr>`
        : '';

    return `<!doctype html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;
             font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:36px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding-bottom:20px;">
            <span style="font-size:20px;font-weight:700;color:#00d1cd;letter-spacing:-0.02em;">Arthings</span>
          </td></tr>
          <tr><td style="font-size:21px;font-weight:700;color:#111827;padding-bottom:12px;line-height:1.35;">
            ${escapeHtml(heading)}
          </td></tr>
          <tr><td style="font-size:15px;color:#374151;line-height:1.65;padding-bottom:20px;">
            ${body}
          </td></tr>
          ${action}
          ${footer}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 8px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.6;">
        ${escapeHtml(config.appName)} — сервіс оренди між людьми<br>
        Ви отримали цей лист, бо для цієї адреси існує акаунт Arthings.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Renders a large, spaced-out numeric code that is easy to read and retype. */
function codeBlock(code) {
    return `<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                        font-size:31px;font-weight:700;letter-spacing:0.32em;
                        color:#111827;background:#f3f4f6;border-radius:12px;
                        padding:18px 20px;text-align:center;margin:4px 0 8px;">
              ${escapeHtml(code)}
            </div>`;
}

/**
 * Sends a message. Never throws — a failed notification email must not roll
 * back the database work that triggered it. Returns success as a boolean so
 * callers can decide whether to surface anything.
 *
 * @returns {Promise<boolean>}
 */
async function send({ to, subject, html, text }) {
    try {
        const info = await getTransport().sendMail({
            from: config.mail.from,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        });

        if (!config.mail.isConfigured) {
            console.log('\n─── 📧 EMAIL (no SMTP configured, not sent) ───');
            console.log(`To:      ${to}`);
            console.log(`Subject: ${subject}`);
            console.log(`Text:    ${info.message ? JSON.parse(info.message).text : ''}`);
            console.log('──────────────────────────────────────────────\n');
        }

        return true;
    } catch (error) {
        console.error(`Failed to send "${subject}" to ${to}:`, error.message);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templates = {
    verifyEmail: ({ name, code, ttlMinutes }) => ({
        subject: `${code} — код підтвердження Arthings`,
        html: layout({
            heading: 'Підтвердьте свою пошту',
            body: `Вітаємо, ${escapeHtml(name)}! Введіть цей код, щоб активувати акаунт:
                   ${codeBlock(code)}`,
            footnote: `Код дійсний ${ttlMinutes} хвилин. Якщо ви не реєструвалися на Arthings, просто проігноруйте цей лист.`
        })
    }),

    passwordReset: ({ name, url, ttlMinutes }) => ({
        subject: 'Відновлення пароля Arthings',
        html: layout({
            heading: 'Скидання пароля',
            body: `Вітаємо, ${escapeHtml(name)}! Ви попросили змінити пароль до свого акаунта.
                   Натисніть кнопку нижче, щоб задати новий.`,
            actionLabel: 'Задати новий пароль',
            actionUrl: url,
            footnote: `Посилання дійсне ${ttlMinutes} хвилин і спрацює лише один раз.
                       Якщо ви цього не робили — нічого робити не треба, ваш пароль лишається чинним.`
        })
    }),

    rentalRequested: ({ ownerName, renterName, itemTitle, startDate, endDate, url }) => ({
        subject: `Новий запит на оренду: ${itemTitle}`,
        html: layout({
            heading: 'Новий запит на оренду',
            body: `Вітаємо, ${escapeHtml(ownerName)}! Користувач <strong>${escapeHtml(renterName)}</strong>
                   хоче орендувати <strong>${escapeHtml(itemTitle)}</strong>
                   з ${escapeHtml(startDate)} до ${escapeHtml(endDate)}.`,
            actionLabel: 'Переглянути запит',
            actionUrl: url
        })
    }),

    rentalDecision: ({ renterName, itemTitle, accepted, ownerResponse, url }) => ({
        subject: accepted
            ? `Запит підтверджено: ${itemTitle}`
            : `Запит відхилено: ${itemTitle}`,
        html: layout({
            heading: accepted ? 'Ваш запит підтверджено' : 'Ваш запит відхилено',
            body: `Вітаємо, ${escapeHtml(renterName)}! Власник ${accepted ? 'підтвердив' : 'відхилив'}
                   ваш запит на <strong>${escapeHtml(itemTitle)}</strong>.
                   ${ownerResponse
                       ? `<br><br><em style="color:#6b7280;">Повідомлення від власника:</em><br>${escapeHtml(ownerResponse)}`
                       : ''}`,
            actionLabel: 'Переглянути запит',
            actionUrl: url
        })
    }),

    rentalCancelled: ({ recipientName, itemTitle, url }) => ({
        subject: `Запит скасовано: ${itemTitle}`,
        html: layout({
            heading: 'Запит на оренду скасовано',
            body: `Вітаємо, ${escapeHtml(recipientName)}! Запит на
                   <strong>${escapeHtml(itemTitle)}</strong> було скасовано.`,
            actionLabel: 'Переглянути історію',
            actionUrl: url
        })
    })
};

module.exports = { send, templates, escapeHtml, layout };
