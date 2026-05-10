import { Router } from "express";
import { Resend } from "resend";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/weekly", requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const resend = new Resend(process.env.RESEND_API_KEY || "re_YttBjLm1_HMm3fBLWEDSL7pKMDdQCsdse");

  try {
    const products = await prisma.product.findMany({
      include: { clicks: true, content: true },
    });

    const now = new Date();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const productStats = products.map(p => {
      const clicks7d = p.clicks.filter(c => new Date(c.createdAt) >= last7d).length;
      const clicks30d = p.clicks.filter(c => new Date(c.createdAt) >= last30d).length;
      const totalClicks = p.clicks.length;
      const conversionRate = 0.02;
      const earnings7d = p.commissionRate && p.price
        ? Math.round(clicks7d * conversionRate * (p.commissionRate / 100) * p.price * 100) / 100
        : 0;
      return { name: p.name, category: p.category, clicks7d, clicks30d, totalClicks, earnings7d, trendScore: p.trendScore, contentCount: p.content.length };
    }).sort((a, b) => b.earnings7d - a.earnings7d);

    const totalClicks7d = productStats.reduce((s, p) => s + p.clicks7d, 0);
    const totalEarnings7d = productStats.reduce((s, p) => s + p.earnings7d, 0);
    const topProduct = productStats[0];
    const trendingProducts = productStats.filter(p => (p.trendScore ?? 0) >= 1);

    const productRows = productStats.map(p => `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 12px 8px; font-size: 14px;">${p.name}</td>
        <td style="padding: 12px 8px; font-size: 14px; text-align: center;">${p.category || "—"}</td>
        <td style="padding: 12px 8px; font-size: 14px; text-align: center;">${p.clicks7d}</td>
        <td style="padding: 12px 8px; font-size: 14px; text-align: center; color: #16a34a; font-weight: bold;">$${p.earnings7d}</td>
        <td style="padding: 12px 8px; font-size: 14px; text-align: center;">${p.contentCount}</td>
      </tr>
    `).join("");

    await resend.emails.send({
      from: "AI Affiliate Engine <onboarding@resend.dev>",
      to: email,
      subject: `Weekly Report — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
      html: `
        <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #111;">
          <div style="background: linear-gradient(135deg, #7c3aed, #2563eb); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">AI Affiliate Engine</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">Weekly Performance Report</p>
          </div>

          <div style="background: white; padding: 32px; border: 1px solid #e5e7eb;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 32px;">
              <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6b7280;">Est. Earnings This Week</p>
                <p style="margin: 4px 0 0; font-size: 28px; font-weight: bold; color: #16a34a;">$${totalEarnings7d.toFixed(2)}</p>
              </div>
              <div style="background: #eff6ff; padding: 16px; border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6b7280;">Total Clicks This Week</p>
                <p style="margin: 4px 0 0; font-size: 28px; font-weight: bold; color: #2563eb;">${totalClicks7d}</p>
              </div>
              <div style="background: #faf5ff; padding: 16px; border-radius: 12px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6b7280;">Top Product</p>
                <p style="margin: 4px 0 0; font-size: 16px; font-weight: bold; color: #7c3aed;">${topProduct?.name ?? "—"}</p>
              </div>
            </div>

            ${trendingProducts.length > 0 ? `
            <div style="background: #fef9c3; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
              <p style="margin: 0; font-weight: bold; color: #854d0e;">Trending This Week</p>
              <p style="margin: 8px 0 0; color: #713f12; font-size: 14px;">${trendingProducts.map(p => p.name).join(", ")}</p>
            </div>` : ""}

            <h2 style="font-size: 16px; color: #111; margin-bottom: 16px;">Product Performance</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 10px 8px; font-size: 12px; text-align: left; color: #6b7280;">Product</th>
                  <th style="padding: 10px 8px; font-size: 12px; text-align: center; color: #6b7280;">Niche</th>
                  <th style="padding: 10px 8px; font-size: 12px; text-align: center; color: #6b7280;">Clicks (7d)</th>
                  <th style="padding: 10px 8px; font-size: 12px; text-align: center; color: #6b7280;">Earnings (7d)</th>
                  <th style="padding: 10px 8px; font-size: 12px; text-align: center; color: #6b7280;">Content</th>
                </tr>
              </thead>
              <tbody>${productRows}</tbody>
            </table>
          </div>

          <div style="background: #f9fafb; padding: 16px; border-radius: 0 0 16px 16px; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #9ca3af;">AI Affiliate Engine — Automated Weekly Report</p>
          </div>
        </div>
      `,
    });

    res.json({ message: "Weekly report sent!", stats: { totalClicks7d, totalEarnings7d, products: productStats.length } });
  } catch (err: any) {
    console.error("Report error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to send report" });
  }
});

export default router;