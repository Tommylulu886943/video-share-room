import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const MAIL_DIR = path.join(process.cwd(), ".mail");

async function deliverConsole(msg: MailMessage): Promise<void> {
  // Dev fallback: log + persist so emails are inspectable without an SMTP server.
  console.log(
    `\n📧 [email:console] to=${msg.to}\n   subject=${msg.subject}\n   ${msg.text.replace(/\n/g, "\n   ")}\n`,
  );
  try {
    await fs.mkdir(MAIL_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = msg.subject.replace(/[^\w一-鿿-]+/g, "_").slice(0, 40);
    const file = path.join(MAIL_DIR, `${stamp}_${safe}.html`);
    await fs.writeFile(
      file,
      `<!-- to: ${msg.to} -->\n<!-- subject: ${msg.subject} -->\n${msg.html}`,
      "utf8",
    );
  } catch (err) {
    console.warn("[email:console] could not persist mail file:", err);
  }
}

async function deliverResend(msg: MailMessage): Promise<void> {
  // Resend HTTP API — preferred on serverless (no outbound SMTP needed).
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.email.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.email.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend API ${res.status}: ${detail}`);
  }
}

async function deliverSmtp(msg: MailMessage): Promise<void> {
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: env.email.smtp.host,
    port: env.email.smtp.port,
    secure: env.email.smtp.port === 465,
    auth: env.email.smtp.user
      ? { user: env.email.smtp.user, pass: env.email.smtp.pass }
      : undefined,
  });
  await transport.sendMail({
    from: env.email.from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

export async function sendMail(msg: MailMessage): Promise<void> {
  try {
    if (env.email.provider === "resend" && env.email.resendApiKey) {
      await deliverResend(msg);
    } else if (env.email.provider === "smtp" && env.email.smtp.host) {
      await deliverSmtp(msg);
    } else {
      await deliverConsole(msg);
    }
  } catch (err) {
    // Never let a mail failure break the request flow; log and continue.
    console.error("[email] delivery failed:", err);
  }
}

// ----- Templates -----

function layout(title: string, bodyHtml: string): string {
  return `<div style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h1 style="font-size:20px;margin:0 0 16px">${env.appName}</h1>
  <h2 style="font-size:16px;margin:0 0 12px">${title}</h2>
  ${bodyHtml}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="font-size:12px;color:#64748b">這是系統自動寄送的信件，請勿直接回覆。</p>
</div>`;
}

function button(href: string, label: string): string {
  return `<p><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${label}</a></p>
  <p style="font-size:12px;color:#64748b">若按鈕無法點擊，請複製此網址：<br>${href}</p>`;
}

export function tmplVerifyEmail(name: string, link: string): MailMessage {
  return {
    to: "",
    subject: `【${env.appName}】請驗證你的 email`,
    html: layout(
      "請驗證你的 email",
      `<p>${name} 你好，</p><p>感謝你註冊。請點擊下方連結完成 email 驗證，完成後你的申請才會送交社團管理者審核。</p>${button(link, "驗證 email")}`,
    ),
    text: `${name} 你好，\n請開啟以下連結完成 email 驗證：\n${link}`,
  };
}

export function tmplAdminNewApplicant(args: {
  adminName: string;
  tenantName: string;
  applicantName: string;
  level: string;
  username: string;
  email: string;
  reviewLink: string;
}): MailMessage {
  return {
    to: "",
    subject: `【${env.appName}】${args.tenantName} 有新的入社申請`,
    html: layout(
      `${args.tenantName} — 新入社申請`,
      `<p>${args.adminName} 你好，</p>
       <p>有一位新成員申請加入「${args.tenantName}」，資料如下：</p>
       <ul>
         <li>名稱：${args.applicantName}</li>
         <li>級數：${args.level}</li>
         <li>帳號：${args.username}</li>
         <li>Email：${args.email}</li>
       </ul>
       ${button(args.reviewLink, "前往審核")}`,
    ),
    text: `${args.adminName} 你好，\n有新申請加入「${args.tenantName}」：\n名稱：${args.applicantName}\n級數：${args.level}\n帳號：${args.username}\nEmail：${args.email}\n審核：${args.reviewLink}`,
  };
}

export function tmplApplicationResult(args: {
  name: string;
  tenantName: string;
  approved: boolean;
  link: string;
}): MailMessage {
  const title = args.approved
    ? `你加入「${args.tenantName}」的申請已通過`
    : `你加入「${args.tenantName}」的申請未通過`;
  const body = args.approved
    ? `<p>${args.name} 你好，</p><p>恭喜！你已成為「${args.tenantName}」的成員，現在可以登入觀看社團影片。</p>${button(args.link, "前往社團")}`
    : `<p>${args.name} 你好，</p><p>很抱歉，你加入「${args.tenantName}」的申請未通過。如有疑問可聯繫社團管理者，你也可以重新提出申請。</p>${button(args.link, "重新申請")}`;
  return {
    to: "",
    subject: `【${env.appName}】${title}`,
    html: layout(title, body),
    text: `${args.name} 你好，\n${title}。\n${args.link}`,
  };
}
