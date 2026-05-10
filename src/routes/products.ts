import { Router } from "express";
import prisma from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

async function autoTagNiche(name: string, description: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 50,
    messages: [{
      role: "user",
      content: `Classify this affiliate product into exactly ONE niche category. Product: "${name}". Description: "${description}". Choose from: AI Tools, Finance, Fitness, Home Office, Tech, Health, Beauty, Travel, Food, Education, Gaming, Parenting, Pet Care, Fashion, Business. Reply with only the category name, nothing else.`
    }],
  });
  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "General";
  return text;
}

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be positive"),
  currency: z.string().optional(),
  affiliateLink: z.string().url().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  network: z.string().optional(),
  category: z.string().optional(),
  profitabilityScore: z.number().optional(),
  trendScore: z.number().optional(),
  status: z.string().optional(),
  slug: z.string().optional(),
});

router.get("/", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(products);
  } catch (err: any) {
    console.error("Products error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch products" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { content: true },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err: any) {
    console.error("Get product error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to fetch product" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const result = productSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten().fieldErrors });
  }
  try {
    let category = result.data.category;
    if (!category && result.data.name) {
      category = await autoTagNiche(result.data.name, result.data.description || "");
    }
    const product = await prisma.product.create({
      data: { ...result.data, category },
    });
    res.json(product);
  } catch (err: any) {
    console.error("Create error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to create product" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const result = productSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten().fieldErrors });
  }
  try {
    const product = await prisma.product.update({
      where: { id },
      data: result.data,
    });
    res.json(product);
  } catch (err: any) {
    console.error("Update error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to update product" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.product.delete({ where: { id } });
    res.json({ message: "Product deleted" });
  } catch (err: any) {
    console.error("Delete error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to delete product" });
  }
});

router.post("/autotag", requireAuth, async (req, res) => {
  const { force } = req.body;
  try {
    const products = await prisma.product.findMany({
      where: force ? {} : { OR: [{ category: null }, { category: "" }] },
    });
    let tagged = 0;
    for (const p of products) {
      const category = await autoTagNiche(p.name, p.description || "");
      await prisma.product.update({ where: { id: p.id }, data: { category } });
      tagged++;
    }
    res.json({ message: `Auto-tagged ${tagged} products`, tagged });
  } catch (err: any) {
    console.error("Autotag error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to auto-tag" });
  }
});

export default router;