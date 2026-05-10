import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

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

    res.json({
      summary: {
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        earnings30d: Math.round(earnings30d * 100) / 100,
        totalClicks,
        clicksToday,
        totalProducts: products.length,
        totalContent,
        topProduct: topProduct?.name ?? null,
      },
      products: productStats.sort((a, b) => b.estimatedEarnings - a.estimatedEarnings),
    });
  } catch (err: any) {
    console.error("Dashboard error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to load dashboard" });
  }
});

export default router;