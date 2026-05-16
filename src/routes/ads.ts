import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/sizes", (req, res) => {
  res.json([
    { name: "Leaderboard", dimensions: "728x90", description: "Top of page banner" },
    { name: "Billboard", dimensions: "970x250", description: "Homepage hero banner" },
    { name: "Medium Rectangle", dimensions: "300x250", description: "Sidebar ad" },
    { name: "Half Page", dimensions: "300x600", description: "Large sidebar ad" },
    { name: "Mobile Banner", dimensions: "320x50", description: "Mobile top banner" },
    { name: "Large Rectangle", dimensions: "336x280", description: "In-content ad" },
    { name: "Site Skin", dimensions: "Custom", description: "Full site branding takeover" },
  ]);
});

router.get("/positions", (req, res) => {
  res.json(["homepage-hero","homepage-sidebar","homepage-bottom","category-top","category-sidebar","post-top","post-middle","post-bottom","site-skin","mobile-top"]);
});

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const total = await prisma.ad.count();
    const active = await prisma.ad.count({ where: { status: "active", startDate: { lte: now }, endDate: { gte: now } } });
    const expired = await prisma.ad.count({ where: { endDate: { lt: now } } });
    const rev = await prisma.ad.aggregate({ _sum: { fee: true } });
    const imp = await prisma.ad.aggregate({ _sum: { impressions: true } });
    const clk = await prisma.ad.aggregate({ _sum: { clicks: true } });
    res.json({ total, active, expired, totalRevenue: rev._sum.fee || 0, totalImpressions: imp._sum.impressions || 0, totalClicks: clk._sum.clicks || 0 });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const ads = await prisma.ad.findMany({ orderBy: { createdAt: "desc" } });
    res.json(ads);
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.get("/active", async (req, res) => {
  try {
    const now = new Date();
    const ads = await prisma.ad.findMany({ where: { status: "active", startDate: { lte: now }, endDate: { gte: now } } });
    res.json(ads);
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.get("/active/:position", async (req, res) => {
  try {
    const now = new Date();
    const ads = await prisma.ad.findMany({ where: { status: "active", position: req.params.position, startDate: { lte: now }, endDate: { gte: now } } });
    res.json(ads);
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { title, advertiser, size, position, mediaUrl, linkUrl, altText, startDate, endDate, fee, notes } = req.body;
    if (!title || !advertiser || !size || !position || !mediaUrl || !linkUrl || !startDate || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const ad = await prisma.ad.create({
      data: { title, advertiser, size, position, mediaUrl, linkUrl, altText: altText || title, startDate: new Date(startDate), endDate: new Date(endDate), fee: fee ? parseFloat(fee) : null, notes: notes || null, status: "active" },
    });
    res.json({ message: "Ad created!", ad });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.put("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const ad = await prisma.ad.update({
      where: { id },
      data: { ...req.body, startDate: req.body.startDate ? new Date(req.body.startDate) : undefined, endDate: req.body.endDate ? new Date(req.body.endDate) : undefined, fee: req.body.fee ? parseFloat(req.body.fee) : undefined },
    });
    res.json({ message: "Ad updated!", ad });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.post("/:id/click", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.ad.update({ where: { id }, data: { clicks: { increment: 1 } } });
    const ad = await prisma.ad.findUnique({ where: { id } });
    res.json({ redirect: ad?.linkUrl });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.ad.delete({ where: { id } });
    res.json({ message: "Ad deleted!" });
  } catch (err: any) { res.status(500).json({ error: err?.message }); }
});

export default router;