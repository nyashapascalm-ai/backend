import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/csv", requireAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const content = req.file.buffer.toString("utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const row of records) {
      try {
        const price = parseFloat(row.price);
        if (!row.name || isNaN(price)) {
          results.skipped++;
          continue;
        }

        await prisma.product.create({
          data: {
            name: row.name,
            description: row.description || null,
            price,
            affiliateLink: row.affiliateLink || row.affiliate_link || null,
            commissionRate: row.commissionRate || row.commission_rate ? parseFloat(row.commissionRate || row.commission_rate) : null,
            network: row.network || null,
            category: row.category || null,
            slug: row.slug || row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Math.random().toString(36).slice(2, 6),
            status: row.status || "active",
          },
        });
        results.created++;
      } catch (err: any) {
        results.errors.push(`${row.name}: ${err.message}`);
        results.skipped++;
      }
    }

    res.json({
      message: `Import complete. ${results.created} products created, ${results.skipped} skipped.`,
      ...results,
    });
  } catch (err: any) {
    console.error("Import error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to import CSV" });
  }
});

router.get("/template", (req, res) => {
  const csv = `name,description,price,affiliateLink,commissionRate,network,category,slug,status
Jasper AI,AI writing tool,49,https://jasper.ai,30,Impact,AI Tools,jasper-ai,active
Grammarly,Writing assistant,12,https://grammarly.com,20,Impact,AI Tools,grammarly,active
Canva Pro,Design tool,13,https://canva.com,25,Canva,AI Tools,canva-pro,active`;

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=products-template.csv");
  res.send(csv);
});

export default router;