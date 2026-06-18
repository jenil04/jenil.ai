import { Resend } from 'resend';
import {
  getResendKey,
  getNotifyEmail,
  getResendFromEmail,
} from './config';

export interface IntroNotification {
  projectName: string;
  category: string;
  contact: string;
  pitch: string;
  links?: string[];
  payerWallet?: string | null;
  txHash: string;
}

/**
 * Email Jenil about a new paid network-intro submission.
 * Best-effort: failures are logged and swallowed so a paid call never fails
 * just because the notification didn't send (the row is already stored).
 */
export async function notifyIntro(n: IntroNotification): Promise<void> {
  try {
    const resend = new Resend(getResendKey());
    const links = (n.links ?? []).filter(Boolean);
    await resend.emails.send({
      from: getResendFromEmail(),
      to: getNotifyEmail(),
      subject: `New $${'5'} intro request: ${n.projectName} (${n.category})`,
      text: [
        `New paid network-introduction request.`,
        ``,
        `Project:  ${n.projectName}`,
        `Category: ${n.category}`,
        `Contact:  ${n.contact}`,
        `Links:    ${links.length ? links.join(', ') : '—'}`,
        `Payer:    ${n.payerWallet ?? 'unknown'}`,
        `Tx:       ${n.txHash}`,
        ``,
        `Pitch:`,
        n.pitch,
        ``,
        `Review in the admin dashboard: /admin`,
      ].join('\n'),
    });
  } catch (err) {
    console.error('[email] notifyIntro failed (non-fatal):', err);
  }
}
