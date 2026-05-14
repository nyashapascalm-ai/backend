import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/generate-sponsored", requireAuth, async (req, res) => {
  const { productId, brandName, brandDescription, brandUrl, sponsorFee, keyMessages } = req.body;

  if (!productId || !brandName) {
    return res.status(400).json({ error: "productId and brandName are required" });
  }

  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: "Product not found" });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are an expert UK content writer specializing in sponsored content. Write a high-quality sponsored blog post.

Brand: ${brandName}
Brand Description: ${brandDescription || "A leading UK brand"}
Product: ${product.name}
Product Description: ${product.description || "Quality product"}
Price: £${product.price}
Key Messages: ${keyMessages || "Quality, value, UK trusted brand"}

Write a sponsored post that:
1. Opens with a clear "Sponsored by ${brandName}" disclosure
2. Is engaging and informative, not overly salesy
3. Naturally integrates the key messages
4. Has a compelling call to action
5. Is 500-700 words
6. Uses UK English
7. Reads like editorial content, not an advert
8. Includes why MumDeals recommends this brand

Return a JSON object with these exact fields:
{
  "title": "SEO-optimized sponsored post title",
  "scriptText": "full sponsored blog post HTML content",
  "caption": "meta description under 160 chars",
  "hashtags": "keyword1, keyword2, keyword3, keyword4",
  "cta": "compelling call to action"
}

Return only valid JSON, no other text.`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Add sponsored disclosure banner to content
    const sponsoredBanner = `
<div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 8px;">
  <span style="font-size: 18px;">⭐</span>
  <span style="font-size: 13px; color: #856404;"><strong>Sponsored Content:</strong> This post is sponsored by ${brandName}. We only partner with brands we trust and believe add value to our readers.</span>
</div>`;

    const content = await prisma.content.create({
      data: {
        productId,
        type: "blog",
        title: parsed.title,
        scriptText: sponsoredBanner + parsed.scriptText,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        cta: parsed.cta,
        sponsored: true,
        sponsorBrand: brandName,
        sponsorFee: sponsorFee ? parseFloat(sponsorFee) : null,
        status: "draft",
      },
    });

    res.json({
      message: `Sponsored post generated for ${brandName}`,
      content,
      brandName,
      sponsorFee,
    });
  } catch (err: any) {
    console.error("Sponsored post error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to generate sponsored post" });
  }
});

router.get("/sponsored", requireAuth, async (req, res) => {
  try {
    const posts = await prisma.content.findMany({
      where: { sponsored: true },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    const totalRevenue = posts.reduce((sum, p) => sum + (p.sponsorFee || 0), 0);
    res.json({ total: posts.length, totalRevenue, posts });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch sponsored posts" });
  }
});

export default router;