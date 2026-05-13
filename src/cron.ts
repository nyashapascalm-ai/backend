import prisma from "./lib/prisma.js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "MumDeals <deals@mumdeals.co.uk>";

async function buildWeeklyEmailHtml(products: any[]): Promise<string> {
  const productCards = products.map(p => {
    const trackingLink = p.slug
      ? `https://backend-production-c3f5.up.railway.app/track/go/${p.slug}`
      : p.affiliateLink || "https://mumdeals.co.uk";
    const image = p.imageUrl
      ? `<img src="${p.imageUrl}" alt="${p.name}" style="width:100%; max-height:180px; object-fit:cover; border-radius:8px 8px 0 0;" />`
      : `<div style="width:100%; height:120px; background:#f0f4ff; border-radius:8px 8px 0 0; font-size:40px; display:flex; align-items:center; justify-content:center;">🛍️</div>`;
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
<body style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; padding:20px; color:#333; background:#f9fafb;">
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

async function sendWeeklyDeals() {
  console.log("🕐 Running weekly deals cron job...");

  try {
    const subscribers = await prisma.subscriber.findMany({
      where: { status: "active" },
    });

    if (subscribers.length === 0) {
      console.log("No active subscribers.");
      return;
    }

    const products = await prisma.product.findMany({
      where: { status: "active" },
      orderBy: { commissionRate: "desc" },
      take: 6,
    });

    if (products.length === 0) {
      console.log("No products found.");
      return;
    }

    const htmlContent = await buildWeeklyEmailHtml(products);
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
      } catch (err: any) {
        console.error(`Failed to send to ${sub.email}:`, err?.message);
        failed++;
      }
    }

    console.log(`✅ Weekly deals sent: ${sent} success, ${failed} failed.`);
  } catch (err: any) {
    console.error("Cron job error:", err?.message);
  } finally {
    await prisma.$disconnect();
  }
}

sendWeeklyDeals();