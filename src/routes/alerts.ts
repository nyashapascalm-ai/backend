import { Router } from "express";
import { Resend } from "resend";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/check", requireAuth, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const products = await prisma.product.findMany({
      include: { clicks: true },
    });

    const now = new Date();
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const alerts: string[] = [];

    for (const product of products) {
      const clicksLastHour = product.clicks.filter(c => new Date(c.createdAt) >= last1h).length;
      const clicksLast24h = product.clicks.filter(c => new Date(c.createdAt) >= last24h).length;
      const avgHourlyRate = clicksLast24h / 24;

      if (clicksLastHour > 0 && avgHourlyRate > 0 && clicksLastHour >= avgHourlyRate * 3) {
        alerts.push(`🔥 ${product.name}: ${clicksLastHour} clicks in the last hour (${Math.round(clicksLastHour / avgHourlyRate)}x normal rate)`);
      } else if (clicksLastHour >= 5) {
        alerts.push(`📈 ${product.name}: ${clicksLastHour} clicks in the last hour`);
      }
    }

    if (alerts.length === 0) {
      return res.json({ message: "No spikes detected", alerts: [] });
    }

    await resend.emails.send({
      from: "AI Affiliate Engine <onboarding@resend.dev>",
      to: email,
      subject: `🚨 Click Spike Alert — ${alerts.length} product(s) trending`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">AI Affiliate Engine — Trend Alert</h2>
          <p>The following products are experiencing unusual click activity:</p>
          ${alerts.map(a => `<div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin: 8px 0;">${a}</div>`).join("")}
          <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Log in to your dashboard to see full stats.</p>
        </div>
      `,
    });

    res.json({ message: "Alert sent", alerts });
  } catch (err: any) {
    console.error("Alert error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to send alert" });
  }
});

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { clicks: true },
    });

    const now = new Date();
    const last1h = new Date(now.getTime() - 60 * 60 * 1000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const summary = products.map(p => {
      const clicksLastHour = p.clicks.filter(c => new Date(c.createdAt) >= last1h).length;
      const clicksLast24h = p.clicks.filter(c => new Date(c.createdAt) >= last24h).length;
      const avgHourlyRate = clicksLast24h / 24;
      const isSpiking = clicksLastHour > 0 && avgHourlyRate > 0 && clicksLastHour >= avgHourlyRate * 3;

      return {
        id: p.id,
        name: p.name,
        clicksLastHour,
        clicksLast24h,
        isSpiking,
        trendScore: p.trendScore,
      };
    });

    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to get summary" });
  }
});

export default router;