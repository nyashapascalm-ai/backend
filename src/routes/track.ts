import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

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
    res.redirect(product.affiliateLink);
  } catch (err: any) {
    console.error("Track error:", err?.message);
    res.status(500).send("Error");
  }
});

router.get("/stats/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  try {
    const clicks = await prisma.click.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });
    const total = clicks.length;
    const today = clicks.filter(c => {
      const d = new Date(c.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    res.json({ total, today, clicks });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch stats" });
  }
});

export default router;