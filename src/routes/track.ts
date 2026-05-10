import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function updateProfitabilityScore(productId: number) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.commissionRate || !product.price) return;

  const clicks = await prisma.click.count({ where: { productId } });
  const estimatedConversionRate = 0.02;
  const revenuePerClick = (product.commissionRate / 100) * product.price * estimatedConversionRate;
  const profitabilityScore = Math.round(revenuePerClick * clicks * 100) / 100;

  await prisma.product.update({
    where: { id: productId },
    data: { profitabilityScore },
  });
}

async function updateTrendScore(productId: number) {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const clicksToday = await prisma.click.count({
    where: { productId, createdAt: { gte: last24h } },
  });
  const clicksWeek = await prisma.click.count({
    where: { productId, createdAt: { gte: last7d } },
  });

  const trendScore = clicksWeek > 0
    ? Math.round((clicksToday / clicksWeek) * 7 * 100) / 100
    : 0;

  await prisma.product.update({
    where: { id: productId },
    data: { trendScore },
  });
}

router.get("/go/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product || !product.affiliateLink) {
      return res.status(404).send("Link not found");
    }
    await prisma.click.create({
      data: {
        productId: product.id,
        ip: req.ip,
        userAgent: req.headers["user-agent"] || null,
        referer: req.headers["referer"] || null,
      },
    });
    await updateProfitabilityScore(product.id);
    await updateTrendScore(product.id);
    res.redirect(product.affiliateLink);
  } catch (err: any) {
    console.error("Track error:", err?.message);
    res.status(500).send("Error");
  }
});

router.get("/stats/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const clicks = await prisma.click.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });
    const total = clicks.length;
    const now = new Date();
    const today = clicks.filter(c => {
      const d = new Date(c.createdAt);
      return d.toDateString() === now.toDateString();
    }).length;
    res.json({
      total,
      today,
      profitabilityScore: product?.profitabilityScore ?? 0,
      trendScore: product?.trendScore ?? 0,
      clicks,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch stats" });
  }
});

router.post("/recalculate/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  try {
    await updateProfitabilityScore(productId);
    await updateTrendScore(productId);
    const product = await prisma.product.findUnique({ where: { id: productId } });
    res.json({
      profitabilityScore: product?.profitabilityScore,
      trendScore: product?.trendScore,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to recalculate" });
  }
});

export default router;