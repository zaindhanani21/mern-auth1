import nodemailer from "nodemailer";
import { BrevoClient } from "@getbrevo/brevo";
import dotenv from "dotenv";

dotenv.config();

const smtpTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const brevo = process.env.BREVO_API_KEY
  ? new BrevoClient({ apiKey: process.env.BREVO_API_KEY })
  : null;

export async function sendEmail({ to, subject, text, html }) {
  const senderEmail = process.env.EMAIL_USER;
  const senderName = "Wallexa";

  if (brevo) {
    await brevo.transactionalEmails.sendTransacEmail({
      subject,
      textContent: text,
      htmlContent: html || (text ? `<p>${text}</p>` : undefined),
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
    });
    return;
  }

  await smtpTransporter.sendMail({
    from: senderEmail,
    to,
    subject,
    text,
    html,
  });
}