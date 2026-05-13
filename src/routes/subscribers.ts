import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { Resend } from "resend";

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "MumDeals <deals@mumdeals.co.uk>";

function buildWeeklyEmailHtml(products: any[]): string {
  const productCards = products.map(p => {
    const trackingLink = p.slug
      ? `https://backend-production-c3f5.up.railway.app/track/go/${p.slug}`
      : p.affiliateLink || "https://mumdeals.co.uk";
    const image = p.imageUrl
      ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%; max-height:180px; object-fit:cover; border-radius:8px 8px 0 0;" />`
      : `<div style="width:100%; height:120px; background:#f0f4ff; border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center; font-size:40px;">🛍️</div>`;

    return `
<div style="background:white; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb; margin-bottom:16px;">
  ${image}
  <div style="padding:16px;">
    <span style="background:#f0f4ff; color:#7c3aed; font-size:11px; padding:3px 8px; border-radius:12px; font-weight:bold;">${p.category || "Deals"}</span>
    <h3 style="margin:8px 0 4px; font-size:16px; color:#1a1a2e;">${p.name}</h3>
    <p style="margin:0 0 8px; color:#666; font-size:13px;">${(p.description || "").slice(0, 100)}...</p>
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:20px; font-weight:bold; color:#1a1a2e;">£${p.price}</span>
      ${p.commissionRate ? `<span style="font-size:12px; color:#16a34a;">${p.commissionRate}% commission</span>` : ""}
    </div>
    <a href="${trackingLink}" style="display:block; background:#e91e8c; color:white; text-align:center; padding:10px; border-radius:6px; text-decoration:none; font-weight:bold; margin-top:12px;">View Deal →</a>
  </div>
</div>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; background:#f9fafb;">

  <div style="text-align:center; margin-bottom:24px; background:white; padding:20px; border-radius:12px;">
    <h1 style="color:#e91e8c; font-size:28px; margin:0;">MumDeals</h1>
    <p style="color:#888; font-size:14px; margin:4px 0;">Your weekly UK deals roundup 🛍️</p>
  </div>

  <div style="background:white; border-radius:12px; padding:20px; margin-bottom:16px;">
    <h2 style="margin:0 0 4px; color:#1a1a2e;">This Week's Top Deals</h2>
    <p style="margin:0; color:#666; font-size:14px;">Hand-picked deals across baby, home, tech, health & more</p>
  </div>

  ${productCards}

  <div style="background:#e91e8c; border-radius:12px; padding:24px; text-align:center; margin-top:16px;">
    <h3 style="margin:0 0 8px; color:white;">Want more deals?</h3>
    <a href="https://mumdeals.co.uk" style="background:white; color:#e91e8c; padding:12px 28px; border-radius:6px; text-decoration:none; font-weight:bold; display:inline-block;">Browse All Deals →</a>
  </div>

  <p style="font-size:11px; color:#999; text-align:center; margin-top:20px;">
    You received this because you subscribed at mumdeals.co.uk.<br>
    <a href="https://mumdeals.co.uk" style="color:#999;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

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

router.post("/send-weekly-deals", requireAuth, async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({
      where: { status: "active" },
    });

    if (subscribers.length === 0) {
      return res.json({ message: "No active subscribers yet." });
    }

    // Pick top 6 products by commission rate
    const products = await prisma.product.findMany({
      where: { status: "active" },
      orderBy: { commissionRate: "desc" },
      take: 6,
    });

    if (products.length === 0) {
      return res.json({ message: "No products found." });
    }

    const htmlContent = buildWeeklyEmailHtml(products);
    const subject = `🛍️ This Week's Best UK Deals — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;

    let sent = 0;
    let failed = 0;

    for (const sub of subscribers) {
      try {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: sub.email,
          subject,
          html: htmlContent,
        });
        sent++;
      } catch { failed++; }
    }

    res.json({ message: `Weekly deals sent to ${sent} subscribers, ${failed} failed.`, sent, failed, products: products.map(p => p.name) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to send weekly deals" });
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