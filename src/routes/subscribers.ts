import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { Resend } from "resend";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "MumDeals <deals@mumdeals.co.uk>";

router.post("/subscribe", async (req, res) => {
  const { email, firstName, source } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) return res.status(200).json({ message: "Already subscribed!" });

    await prisma.subscriber.create({
      data: { email, firstName, source: source || "website", status: "active" },
    });

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Welcome to MumDeals — Your Weekly Deals Start Now! 🎉",
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #e91e8c; font-size: 28px; margin: 0;">MumDeals</h1>
    <p style="color: #888; font-size: 14px; margin: 5px 0;">Smart deals across every part of life</p>
  </div>
  <h2 style="color: #1a1a2e;">Hi ${firstName || "there"}! Welcome to MumDeals 👋</h2>
  <p>You're now part of our community of smart UK shoppers getting the best deals delivered every week.</p>
  <p>Here's what you'll get:</p>
  <ul>
    <li>🍼 <strong>Baby & Parenting</strong> deals — nursery, toys, feeding</li>
    <li>🏠 <strong>Home & Garden</strong> — furniture, bedding, kitchen</li>
    <li>💻 <strong>Tech & AI Tools</strong> — software, gadgets, broadband</li>
    <li>✈️ <strong>Travel</strong> — insurance, tickets, adventures</li>
    <li>💊 <strong>Health & Wellness</strong> — beauty, fitness, wellbeing</li>
    <li>💰 <strong>Finance</strong> — insurance, investments, savings</li>
  </ul>
  <div style="background: #f8f9fa; border-left: 4px solid #e91e8c; padding: 20px; margin: 24px 0; border-radius: 8px;">
    <h3 style="margin: 0 0 8px; color: #1a1a2e;">Start browsing deals now</h3>
    <a href="https://mumdeals.co.uk" style="background: #e91e8c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; margin-top: 8px;">Browse MumDeals →</a>
  </div>
  <p style="font-size: 12px; color: #999; margin-top: 30px;">
    You received this because you subscribed at mumdeals.co.uk.<br>
    <a href="https://mumdeals.co.uk" style="color: #999;">Unsubscribe</a>
  </p>
</body>
</html>`,
      });
    } catch (emailErr: any) {
      console.error("Welcome email failed:", emailErr?.message);
      // Still return success — subscriber was saved even if email failed
    }

    res.json({ message: "Subscribed! Check your email for a welcome message." });
  } catch (err: any) {
    console.error("Subscribe error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to subscribe" });
  }
});

router.get("/subscribers", requireAuth, async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ total: subscribers.length, subscribers });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch subscribers" });
  }
});

router.post("/send-deals-email", requireAuth, async (req, res) => {
  const { subject, htmlContent } = req.body;
  try {
    const subscribers = await prisma.subscriber.findMany({
      where: { status: "active" },
    });

    if (subscribers.length === 0) {
      return res.json({ message: "No active subscribers yet." });
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: sub.email,
          subject: subject || "Your Weekly MumDeals Newsletter 🛍️",
          html: htmlContent,
        });
        sent++;
      } catch { failed++; }
    }

    res.json({ message: `Sent to ${sent} subscribers, ${failed} failed.`, sent, failed });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send emails" });
  }
});

export default router;