import type { RenderedEmail, TemplateData, TemplateName } from "./contract";

/**
 * Minimal HTML + plain-text templates (spec 10.2). Built with template literals
 * to avoid a rendering dependency for this phase; swapping in react-email later
 * only changes this file, not the adapter contract.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">${bodyHtml}</body></html>`;
}

function renderVerifyEmail(data: TemplateData): RenderedEmail {
  const url = String(data.url ?? "");
  const name = typeof data.name === "string" && data.name ? data.name : "there";
  const safeUrl = escapeHtml(url);
  return {
    subject: "Verify your email address",
    html: layout(
      `<h2>Confirm your email</h2>
       <p>Hi ${escapeHtml(name)}, thanks for signing up. Please confirm your email address to finish setting up your account.</p>
       <p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Verify email</a></p>
       <p>Or paste this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p>`,
    ),
    text: `Hi ${name}, thanks for signing up.\n\nConfirm your email address by opening this link:\n${url}\n`,
  };
}

function renderWelcome(data: TemplateData): RenderedEmail {
  const name = typeof data.name === "string" && data.name ? data.name : "there";
  return {
    subject: "Welcome aboard",
    html: layout(
      `<h2>Welcome, ${escapeHtml(name)}!</h2><p>Your email is verified and your account is ready.</p>`,
    ),
    text: `Welcome, ${name}! Your email is verified and your account is ready.\n`,
  };
}

function renderInvitation(data: TemplateData): RenderedEmail {
  const url = String(data.url ?? "");
  const safeUrl = escapeHtml(url);
  const orgName = typeof data.orgName === "string" && data.orgName ? data.orgName : "a team";
  const inviter =
    typeof data.inviterName === "string" && data.inviterName ? data.inviterName : "A teammate";
  const role = typeof data.role === "string" && data.role ? data.role : "member";
  return {
    subject: `You've been invited to join ${orgName}`,
    html: layout(
      `<h2>Join ${escapeHtml(orgName)}</h2>
       <p>${escapeHtml(inviter)} invited you to join <strong>${escapeHtml(orgName)}</strong> as ${escapeHtml(role)}.</p>
       <p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Accept invitation</a></p>
       <p>Or paste this link into your browser:<br><a href="${safeUrl}">${safeUrl}</a></p>
       <p style="color:#666;font-size:13px">If you weren't expecting this, you can ignore this email.</p>`,
    ),
    text: `${inviter} invited you to join ${orgName} as ${role}.\n\nAccept the invitation by opening this link:\n${url}\n\nIf you weren't expecting this, you can ignore this email.\n`,
  };
}

const renderers: Record<TemplateName, (data: TemplateData) => RenderedEmail> = {
  "verify-email": renderVerifyEmail,
  welcome: renderWelcome,
  invitation: renderInvitation,
};

export function renderTemplate(template: TemplateName, data: TemplateData): RenderedEmail {
  return renderers[template](data);
}
