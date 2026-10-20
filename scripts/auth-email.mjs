// Sign-in emails: builds the templates in supabase/templates from one layout,
// and applies them to the hosted project with Resend as the sender.
//
//   pnpm email:build              write supabase/templates/*.html
//   pnpm email:apply --dry-run    show what would change on the hosted project
//   pnpm email:apply              apply it (needs SUPABASE_ACCESS_TOKEN and RESEND_API_KEY)
//
// Links in every email are the redirect the app asked for (always
// <site>/auth/confirm?next=…, see src/lib/email-link.ts) plus the one-time
// token_hash, so they open on the site that sent them and on any device.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templates = join(root, "supabase/templates");

const SITE = "https://mavuno.au";
const SENDER = { email: "hello@mavuno.au", name: "Mavuno" };
// Where people write to us; mavuno.au doesn't receive mail. Matches src/lib/site.ts.
const CONTACT = "bakari@mentorsoutreach.org";
const OPERATOR = "Mentors Outreach";
// One hour for every one-time link and code.
const LINK_LIFETIME_SECONDS = 3600;

const C = { ground: "#f6f4ef", surface: "#ffffff", ink: "#1b1a17", muted: "#67625a", hairline: "#e6e1d8", primary: "#12704f" };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const link = (type) => `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${type}`;

const button = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="border-radius:10px;background:${C.primary}">` +
  `<a href="${href}" style="display:inline-block;padding:13px 26px;font:600 16px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:10px">${label}</a>` +
  `</td></tr></table>`;

const fallback = (href) =>
  `<p style="margin:20px 0 0;font:13px/1.5 ${FONT};color:${C.muted}">Button not working? Copy this link into your browser:<br>` +
  `<a href="${href}" style="color:${C.primary};word-break:break-all">${href}</a></p>`;

const code = `<p style="margin:24px 0 8px;font:600 32px/1 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:6px;color:${C.ink}">{{ .Token }}</p>`;

function layout({ preheader, heading, body, action, note }) {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${C.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ground}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 24px">
<a href="${SITE}"><img src="${SITE}/brand/mavuno-email-wordmark.png" width="180" height="47" alt="Mavuno" style="display:block;border:0;font:700 22px ${FONT};color:${C.ink}"></a>
</td></tr>
<tr><td style="background:${C.surface};border:1px solid ${C.hairline};border-radius:16px;padding:36px 32px">
<h1 style="margin:0 0 14px;font:700 24px/1.25 ${FONT};letter-spacing:-0.3px;color:${C.ink}">${heading}</h1>
<p style="margin:0;font:16px/1.6 ${FONT};color:${C.ink}">${body}</p>
${action}
<p style="margin:24px 0 0;font:14px/1.6 ${FONT};color:${C.muted}">${note}</p>
</td></tr>
<tr><td style="padding:24px 4px 0;font:12px/1.6 ${FONT};color:${C.muted}">
Mavuno, the social network for African Australians. Run by ${OPERATOR}, Queensland.<br>
<a href="${SITE}/privacy" style="color:${C.muted}">Privacy</a> &middot; <a href="${SITE}/rules" style="color:${C.muted}">Community rules</a> &middot; <a href="mailto:${CONTACT}" style="color:${C.muted}">${CONTACT}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

const IGNORE = "If you didn't ask for this, you can ignore this email. Nothing will change.";

// Keys match the hosted project's auth config (mailer_subjects_<key>, mailer_templates_<key>_content).
const EMAILS = {
  confirmation: {
    subject: "Confirm your email for Mavuno",
    html: layout({
      preheader: "One click and your Mavuno account is ready.",
      heading: "Confirm your email",
      body: "Welcome to Mavuno. Confirm this is your email address and you can finish setting up your profile, join your city's space and start following people.",
      action: button(link("email"), "Confirm email") + fallback(link("email")),
      note: `This link works once and expires in an hour. ${IGNORE}`,
    }),
  },
  magic_link: {
    subject: "Your Mavuno sign-in link",
    html: layout({
      preheader: "Sign in to Mavuno without a password.",
      heading: "Sign in to Mavuno",
      body: "Here's the sign-in link you asked for. It signs you in on the device you open it on.",
      action: button(link("email"), "Sign in") + fallback(link("email")),
      note: `This link works once and expires in an hour. ${IGNORE}`,
    }),
  },
  recovery: {
    subject: "Reset your Mavuno password",
    html: layout({
      preheader: "Choose a new password for Mavuno.",
      heading: "Reset your password",
      body: "Someone asked to reset the password for the Mavuno account with this email address. Choose a new one with the button below.",
      action: button(link("recovery"), "Choose a new password") + fallback(link("recovery")),
      note: `This link works once and expires in an hour. ${IGNORE} Your current password keeps working.`,
    }),
  },
  email_change: {
    subject: "Confirm your new email for Mavuno",
    html: layout({
      preheader: "Confirm the change to your Mavuno email address.",
      heading: "Confirm your new email",
      body: "Confirm that you want to change your Mavuno email address from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.",
      action: button(link("email_change"), "Confirm change") + fallback(link("email_change")),
      note: `This link works once and expires in an hour. If you didn't ask for this, someone may have access to your account: change your password and email ${CONTACT}.`,
    }),
  },
  invite: {
    subject: "You're invited to Mavuno",
    html: layout({
      preheader: "Join the social network for African Australians.",
      heading: "You're invited to Mavuno",
      body: "You've been invited to join Mavuno, the social network for African Australians. Accept to set up your account.",
      action: button(link("invite"), "Accept invite") + fallback(link("invite")),
      note: `This link works once and expires in an hour. ${IGNORE}`,
    }),
  },
  reauthentication: {
    subject: "Your Mavuno verification code",
    html: layout({
      preheader: "Your code to confirm it's you.",
      heading: "Confirm it's you",
      body: "Enter this code in Mavuno to continue:",
      action: code,
      note: `The code expires in an hour. If you didn't ask for it, someone may know your password: change it and email ${CONTACT}.`,
    }),
  },
};

function build() {
  mkdirSync(templates, { recursive: true });
  for (const [key, email] of Object.entries(EMAILS)) writeFileSync(join(templates, `${key}.html`), email.html);
  console.log(`Wrote ${Object.keys(EMAILS).length} templates to supabase/templates`);
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

async function apply(dryRun) {
  const token = env("SUPABASE_ACCESS_TOKEN");
  const ref = new URL(env("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
  const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const desired = {
    site_url: SITE,
    uri_allow_list: [`${SITE}/**`, `https://www.mavuno.au/**`, "http://localhost:3000/**"].join(","),
    mailer_autoconfirm: false,
    mailer_otp_exp: LINK_LIFETIME_SECONDS,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: env("RESEND_API_KEY"),
    smtp_admin_email: SENDER.email,
    smtp_sender_name: SENDER.name,
    ...Object.fromEntries(
      Object.keys(EMAILS).flatMap((key) => [
        [`mailer_subjects_${key}`, EMAILS[key].subject],
        [`mailer_templates_${key}_content`, readFileSync(join(templates, `${key}.html`), "utf8")],
      ]),
    ),
  };

  const response = await fetch(endpoint, { headers });
  if (!response.ok) throw new Error(`Reading the auth config failed: ${response.status} ${await response.text()}`);
  const current = await response.json();
  // The API never returns the SMTP password, only a mask, so a set one counts as unchanged.
  const differs = (key) => (key === "smtp_pass" ? !current.smtp_pass : current[key] !== desired[key]);
  const changed = Object.keys(desired).filter(differs);
  const shown = (key, value) => (key === "smtp_pass" ? "(secret)" : key.endsWith("_content") ? `(${String(value ?? "").length} characters)` : JSON.stringify(value));
  for (const key of changed) console.log(`${key}: ${shown(key, current[key])} → ${shown(key, desired[key])}`);
  if (changed.length === 0) return console.log("Already up to date.");
  if (dryRun) return console.log(`\nDry run: ${changed.length} settings would change.`);

  const update = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(Object.fromEntries(changed.map((key) => [key, desired[key]]))) });
  if (!update.ok) throw new Error(`Updating the auth config failed: ${update.status} ${await update.text()}`);
  console.log(`\nApplied ${changed.length} settings.`);
}

const [command, flag] = process.argv.slice(2);
if (command === "build") build();
else if (command === "apply") await apply(flag === "--dry-run");
else console.log("Usage: node scripts/auth-email.mjs build | apply [--dry-run]");
