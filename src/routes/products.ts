import { Router } from "express";
import prisma from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be positive"),
  affiliateLink: z.string().url().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  network: z.string().optional(),
  category: z.string().optional(),
  profitabilityScore: z.number().optional(),
  trendScore: z.number().optional(),
  status: z.string().optional(),
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
    const product = await prisma.product.create({ data: result.data });
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

export default router;