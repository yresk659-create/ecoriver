import 'server-only';

import nodemailer from 'nodemailer';
import { requireServerEnv } from './config';

function getSmtpPort(): number {
  const value = Number(requireServerEnv('SMTP_PORT'));
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error('SMTP_PORT tidak valid.');
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

export async function sendOtpEmail(
  email: string,
  recipientName: string,
  code: string
): Promise<void> {
  const port = getSmtpPort();
  const smtpUser = requireServerEnv('SMTP_USER');
  const transporter = nodemailer.createTransport({
    host: requireServerEnv('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: {
      user: smtpUser,
      pass: requireServerEnv('SMTP_PASS'),
    },
  });

  await transporter.sendMail({
    from: {
      name: 'Smart River',
      address: smtpUser,
    },
    to: email,
    subject: 'Kode OTP Smart River',
    text: `Halo, ${recipientName}\n\nGunakan Kode OTP berikut:\n\n${code}\n\nKode OTP ini berlaku selama 5 menit.\n\nJangan berikan kode ini kepada siapa pun.`,
    html: `<p>Halo, <strong>${escapeHtml(recipientName)}</strong></p>
<p>Gunakan Kode OTP berikut:</p>
<p><strong>${escapeHtml(code)}</strong></p>
<p>Kode OTP ini berlaku selama <strong>5 menit</strong>.</p>
<p>Jangan berikan kode ini kepada siapa pun.</p>`,
  });
}
