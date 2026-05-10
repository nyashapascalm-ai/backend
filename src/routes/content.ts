import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

dotenv.config();

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post("/generate/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  const { type } = req.body;
  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: "Product not found" });
    const prompts: Record<string, string> = {
      tiktok: `You are an expert affiliate marketer. Create a TikTok video script for this product. Name: ${product.name}, Description: ${product.description}, Price: $${product.price}, Category: ${product.category}, Commission: ${product.commissionRate}%. Return a JSON object with these exact fields: { "title": "hook title", "scriptText": "full spoken script 60-90 seconds", "caption": "TikTok caption under 150 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5", "thumbnailPrompt": "description for thumbnail", "cta": "call to action" }. Return only valid JSON, no other text.`,
      blog: `You are an expert affiliate content writer. Write a blog post for this product. Name: ${product.name}, Description: ${product.description}, Price: $${product.price}, Category: ${product.category}. Return a JSON object with these exact fields: { "title": "SEO blog post title", "scriptText": "full blog post 400-600 words in markdown", "caption": "meta description under 160 chars", "hashtags": "keyword1, keyword2, keyword3", "thumbnailPrompt": "description for featured image", "cta": "call to action" }. Return only valid JSON, no other text.`,
      instagram: `You are an expert affiliate marketer. Create an Instagram post for this product. Name: ${product.name}, Description: ${product.description}, Price: $${product.price}, Category: ${product.category}. Return a JSON object with these exact fields: { "title": "Instagram post hook", "scriptText": "full Instagram caption 150-300 words", "caption": "short version under 125 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8", "thumbnailPrompt": "description for Instagram image", "cta": "call to action" }. Return only valid JSON, no other text.`,
    };
    const prompt = prompts[type];
    if (!prompt) return res.status(400).json({ error: "Invalid type. Use: tiktok, blog, instagram" });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const content = await prisma.content.create({
      data: {
        productId,
        type,
        title: parsed.title,
        scriptText: parsed.scriptText,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        thumbnailPrompt: parsed.thumbnailPrompt,
        cta: parsed.cta,
        status: "draft",
      },
    });
    res.json(content);
  } catch (err: any) {
    console.error("Content generation error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to generate content" });
  }
});

router.get("/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  try {
    const content = await prisma.content.findMany({
      where: { productId },
      orderBy: { createdAt: "desc" },
    });
    res.json(content);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch content" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await prisma.content.delete({ where: { id } });
    res.json({ message: "Content deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to delete content" });
  }
});

export default router;