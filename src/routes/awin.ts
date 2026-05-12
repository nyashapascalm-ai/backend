import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { parse } from "csv-parse/sync";
import zlib from "zlib";

const router = Router();

const PUBLISHER_ID = process.env.AWIN_PUBLISHER_ID || "2660114";
const API_TOKEN = process.env.AWIN_API_TOKEN || "7c2db1e6-a8bb-4ae4-8116-71551e5e66e5";
const FEED_TOKEN = "10daf2dbf3dde45a5a7275beb3e4bd51";

const ACTIVE_FEEDS = [
  { id: "112637", name: "Mamas & Papas", category: "Baby & Parenting", currency: "GBP" },
  { id: "60005", name: "Online Home Shop", category: "Home & Garden", currency: "GBP" },
  { id: "71935", name: "PatPat UK", category: "Baby & Parenting", currency: "GBP" },
  { id: "97411", name: "Johnston Prams", category: "Baby & Parenting", currency: "GBP" },
  { id: "101126", name: "Saltrock UK", category: "Travel and Outdoors", currency: "GBP" },
  { id: "115013", name: "Zonky UK", category: "Home & Garden", currency: "GBP" },
  { id: "443", name: "Loft 25", category: "Home & Garden", currency: "GBP" },
  { id: "1936", name: "Theatre Tickets Direct", category: "Travel and Outdoors", currency: "GBP" },
  { id: "15112", name: "Tirendo UK", category: "Home & Garden", currency: "GBP" },
  { id: "28347", name: "Sals Forever Flowers", category: "Home & Garden", currency: "GBP" },
  { id: "62671", name: "Ulike UK", category: "Health & Wellness", currency: "GBP" },
];

router.get("/programmes", requireAuth, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.awin.com/publishers/${PUBLISHER_ID}/programmes?relationship=joined`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch programmes" });
  }
});

router.get("/feeds", requireAuth, async (req, res) => {
  res.json(ACTIVE_FEEDS);
});

router.get("/feed-products/:feedId", requireAuth, async (req, res) => {
  const { feedId } = req.params;
  const { limit = "50", search = "" } = req.query;

  try {
    const feedUrl = `https://productdata.awin.com/datafeed/download/apikey/${FEED_TOKEN}/fid/${feedId}/format/csv/language/en/delimiter/%2C/compression/gzip/adultcontent/1/columns/aw_deep_link%2Cproduct_name%2Caw_product_id%2Cdescription%2Cmerchant_category%2Csearch_price%2Cmerchant_name%2Ccategory_name%2Caw_image_url%2Ccurrency%2Cin_stock/`;

    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`Feed fetch failed: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const decompressed = zlib.gunzipSync(Buffer.from(buffer));
    const csvText = decompressed.toString("utf-8");

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    });

    let filtered = records as any[];
    if (search) {
      const s = (search as string).toLowerCase();
      filtered = filtered.filter((r: any) =>
        r.product_name?.toLowerCase().includes(s) ||
        r.merchant_category?.toLowerCase().includes(s) ||
        r.category_name?.toLowerCase().includes(s)
      );
    }

    const limitNum = parseInt(limit as string);
    const products = filtered.slice(0, limitNum).map((r: any) => ({
      name: r.product_name,
      description: r.description?.slice(0, 200),
      price: parseFloat(r.search_price) || 0,
      currency: r.currency || "GBP",
      affiliateLink: r.aw_deep_link,
      category: r.category_name || r.merchant_category,
      network: r.merchant_name || "Awin",
      imageUrl: r.aw_image_url || null,
      inStock: r.in_stock,
    }));

    res.json({ total: filtered.length, products });
  } catch (err: any) {
    console.error("Feed error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch feed products" });
  }
});

router.post("/import-product", requireAuth, async (req, res) => {
  const { name, description, price, affiliateLink, commissionRate, category, network, currency, imageUrl } = req.body;
  try {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    const product = await prisma.product.create({
      data: {
        name,
        description,
        price: parseFloat(price) || 0,
        affiliateLink,
        commissionRate: commissionRate ? parseFloat(commissionRate) : null,
        network: network || "Awin",
        category,
        slug,
        status: "active",
        currency: currency || "GBP",
        imageUrl: imageUrl || null,
      },
    });
    res.json(product);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to import product" });
  }
});

router.post("/import-bulk", requireAuth, async (req, res) => {
  const { products } = req.body;
  if (!products?.length) return res.status(400).json({ error: "No products provided" });

  let imported = 0;
  let failed = 0;

  for (const p of products) {
    try {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6);
      await prisma.product.create({
        data: {
          name: p.name,
          description: p.description,
          price: parseFloat(p.price) || 0,
          affiliateLink: p.affiliateLink,
          network: p.network || "Awin",
          category: p.category,
          slug,
          status: "active",
          currency: p.currency || "GBP",
          imageUrl: p.imageUrl || null,
        },
      });
      imported++;
    } catch {
      failed++;
    }
  }

  res.json({ message: `Imported ${imported} products, ${failed} failed.`, imported, failed });
});

router.post("/backfill-images", requireAuth, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { imageUrl: null },
    });

    if (products.length === 0) {
      return res.json({ message: "All products already have images!", updated: 0 });
    }

    const feedProducts: Record<string, string> = {};

    for (const feed of ACTIVE_FEEDS) {
      try {
        const feedUrl = `https://productdata.awin.com/datafeed/download/apikey/${FEED_TOKEN}/fid/${feed.id}/format/csv/language/en/delimiter/%2C/compression/gzip/adultcontent/1/columns/aw_deep_link%2Cproduct_name%2Caw_product_id%2Cdescription%2Cmerchant_category%2Csearch_price%2Cmerchant_name%2Ccategory_name%2Caw_image_url%2Ccurrency%2Cin_stock/`;
        const response = await fetch(feedUrl);
        if (!response.ok) continue;

        const buffer = await response.arrayBuffer();
        const decompressed = zlib.gunzipSync(Buffer.from(buffer));
        const csvText = decompressed.toString("utf-8");
        const records = parse(csvText, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_quotes: true,
          relax_column_count: true,
        }) as any[];

        for (const r of records) {
          if (r.aw_image_url && r.product_name) {
            const key = r.product_name.toLowerCase().trim();
            feedProducts[key] = r.aw_image_url;
          }
        }
        console.log(`Feed ${feed.name}: loaded ${records.length} products`);
      } catch (err: any) {
        console.error(`Feed ${feed.name} failed:`, err?.message);
        continue;
      }
    }

    const results = { updated: 0, notFound: 0, total: products.length };

    for (const product of products) {
      const key = product.name.toLowerCase().trim()
        .replace(/&amp;/g, "&")
        .replace(/&#038;/g, "&")
        .replace(/\s+/g, " ");

      let imageUrl = feedProducts[key];

      if (!imageUrl) {
        const partialKey = Object.keys(feedProducts).find(k =>
          k.includes(key.slice(0, 30)) || key.includes(k.slice(0, 30))
        );
        if (partialKey) imageUrl = feedProducts[partialKey];
      }

      if (imageUrl) {
        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl },
        });
        results.updated++;
      } else {
        results.notFound++;
      }
    }

    res.json({
      message: `Backfilled images: ${results.updated} updated out of ${results.total} products without images.`,
      ...results,
      feedProductsIndexed: Object.keys(feedProducts).length,
    });
  } catch (err: any) {
    console.error("Backfill error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to backfill images" });
  }
});

router.get("/transactions", requireAuth, async (req, res) => {
  const { startDate, endDate } = req.query;
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const end = endDate || new Date().toISOString().split("T")[0];
  try {
    const response = await fetch(
      `https://api.awin.com/publishers/${PUBLISHER_ID}/transactions/?startDate=${start}T00:00:00&endDate=${end}T23:59:59&timezone=UTC`,
      { headers: { Authorization: `Bearer ${API_TOKEN}` } }
    );
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch transactions" });
  }
});

export default router;