// Writes the Supabase Auth email templates in Digivated's email style.
// Run from the repository root: node scripts/render-auth-emails.mjs
import { writeFileSync } from 'node:fs';
const { renderEmail } = await import('../server/email-layout.mjs');
const url = 'https://digivated.invalid/CONFIRMATION_URL';
const make = (file, opts) => writeFileSync(`email-templates/${file}`, renderEmail(opts).html.replaceAll(url, '{{ .ConfirmationURL }}'));
make('supabase-confirm-signup.html', { label: 'DIGIVATED / ACCOUNT', title: 'Confirm your email.', preheader: 'Confirm your email to finish creating your Digivated account.', paragraphs: ['Welcome to Digivated. Confirm your email to finish creating your account and start launching.'], cta: { label: 'Confirm email', href: url }, after: ['If you didn’t sign up, you can ignore this email.'] });
make('supabase-magic-link.html', { label: 'DIGIVATED / SIGN IN', title: 'Your sign-in link.', preheader: 'Use this link to sign in to Digivated.', paragraphs: ['Use the button below to sign in to Digivated. The link works once and expires soon.'], cta: { label: 'Sign in to Digivated', href: url }, after: ['If you didn’t ask to sign in, you can ignore this email.'] });
make('supabase-reset-password.html', { label: 'DIGIVATED / ACCOUNT', title: 'Reset your password.', preheader: 'Choose a new password for Digivated.', paragraphs: ['Someone asked to reset the password for your Digivated account.'], cta: { label: 'Choose a new password', href: url }, after: ['If this wasn’t you, ignore this email. Your password stays the same.'] });
make('supabase-change-email.html', { label: 'DIGIVATED / ACCOUNT', title: 'Confirm your new email.', preheader: 'Confirm the new email address for your Digivated account.', paragraphs: ['Confirm this address to use it for your Digivated account.'], cta: { label: 'Confirm new email', href: url }, after: ['If you didn’t request this, ignore this email.'] });
