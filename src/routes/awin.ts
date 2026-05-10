import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "2660114";
const API_TOKEN = process.env.AWIN_API_TOKEN || "7c2db1e6-a8bb-4ae4-8116-71551e5e66e5";

router.get("/programmes", requireAuth, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.awin.com/publishers/${PUBLISHER_ID}/programmes?relationship=joined`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Awin programmes error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch programmes" });
  }
});

router.get("/products", requireAuth, async (req, res) => {
  const { category, keyword, limit = "20" } = req.query;
  try {
    const feedUrl = `https://ui.awin.com/productdata-darwin-download/publisher/${PUBLISHER_ID}/10daf2dbf3dde45a5a7275beb3e4bd51/1/feedList`;
    const feedRes = await fetch(feedUrl);
    const feedData = await feedRes.json();
    res.json({ feeds: feedData, message: "Feed list retrieved" });
  } catch (err: any) {
    console.error("Awin products error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch products" });
  }
});

router.post("/import-product", requireAuth, async (req, res) => {
  const { name, description, price, affiliateLink, commissionRate, category, network } = req.body;
  try {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    const product = await prisma.product.create({
      data: {
        name,
        description,
        price: parseFloat(price),
        affiliateLink,
        commissionRate: commissionRate ? parseFloat(commissionRate) : null,
        network: network || "Awin",
        category,
        slug,
        status: "active",
        currency: "GBP",
      },
    });
    res.json(product);
  } catch (err: any) {
    console.error("Import product error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to import product" });
  }
});

router.get("/transactions", requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const end = endDate || new Date().toISOString().split("T")[0];
  try {
    const response = await fetch(
      `https://api.awin.com/publishers/${PUBLISHER_ID}/transactions/?startDate=${start}T00:00:00&endDate=${end}T23:59:59&timezone=UTC`,
      {
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Awin transactions error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch transactions" });
  }
});

export default router;