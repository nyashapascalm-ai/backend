import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "2660114";
const API_TOKEN = process.env.AWIN_API_TOKEN || "7c2db1e6-a8bb-4ae4-8116-71551e5e66e5";

router.get("/", requireAuth, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { clicks: true, content: true },
    });

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const productStats = products.map(p => {
      const totalClicks = p.clicks.length;
      const clicksToday = p.clicks.filter(c => new Date(c.createdAt) >= last24h).length;
      const clicks7d = p.clicks.filter(c => new Date(c.createdAt) >= last7d).length;
      const clicks30d = p.clicks.filter(c => new Date(c.createdAt) >= last30d).length;
      const conversionRate = 0.02;
      const estimatedEarnings = p.commissionRate && p.price
        ? Math.round(totalClicks * conversionRate * (p.commissionRate / 100) * p.price * 100) / 100
        : 0;
      const earnings30d = p.commissionRate && p.price
        ? Math.round(clicks30d * conversionRate * (p.commissionRate / 100) * p.price * 100) / 100
        : 0;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        network: p.network,
        price: p.price,
        currency: p.currency,
        commissionRate: p.commissionRate,
        status: p.status,
        slug: p.slug,
        profitabilityScore: p.profitabilityScore,
        trendScore: p.trendScore,
        totalClicks,
        clicksToday,
        clicks7d,
        clicks30d,
        estimatedEarnings,
        earnings30d,
        contentCount: p.content.length,
      };
    });

    const totalEarnings = productStats.reduce((sum, p) => sum + p.estimatedEarnings, 0);
    const earnings30d = productStats.reduce((sum, p) => sum + p.earnings30d, 0);
    const totalClicks = productStats.reduce((sum, p) => sum + p.totalClicks, 0);
    const clicksToday = productStats.reduce((sum, p) => sum + p.clicksToday, 0);
    const totalContent = productStats.reduce((sum, p) => sum + p.contentCount, 0);
    const topProduct = productStats.sort((a, b) => b.estimatedEarnings - a.estimatedEarnings)[0];

    // Fetch real Awin transactions
    let awinRevenue = 0;
    let awinTransactions = 0;
    let awinPending = 0;
    try {
      const start = last30d.toISOString().split("T")[0];
      const end = now.toISOString().split("T")[0];
      const awinRes = await fetch(
        `https://api.awin.com/publishers/${PUBLISHER_ID}/transactions/?startDate=${start}T00:00:00&endDate=${end}T23:59:59&timezone=UTC`,
        { headers: { Authorization: `Bearer ${API_TOKEN}` } }
      );
      const awinData = await awinRes.json();
      if (Array.isArray(awinData)) {
        awinTransactions = awinData.length;
        awinRevenue = awinData.reduce((sum: number, t: any) => sum + (parseFloat(t.commissionAmount?.amount) || 0), 0);
        awinPending = awinData.filter((t: any) => t.commissionStatus === "pending").length;
      }
    } catch (e) {
      console.log("Awin fetch skipped");
    }

    res.json({
      summary: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        earnings30d: Math.round(earnings30d * 100) / 100,
        totalClicks,
        clicksToday,
        totalProducts: products.length,
        totalContent,
        topProduct: topProduct?.name ?? null,
        awinRevenue: Math.round(awinRevenue * 100) / 100,
        awinTransactions,
        awinPending,
      },
      products: productStats.sort((a, b) => b.estimatedEarnings - a.estimatedEarnings),
    });
  } catch (err: any) {
    console.error("Dashboard error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to load dashboard" });
  }
});

export default router;