import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function generateForProduct(productId: number, type: string, anthropic: Anthropic) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error("Product not found");

  const niche = product.category || "General";
  const nicheContext: Record<string, string> = {
    "AI Tools": "Target audience: entrepreneurs, content creators, and tech-savvy professionals who want to save time and boost productivity. Use language around efficiency, automation, and staying ahead of the competition.",
    "Finance": "Target audience: people wanting financial freedom, passive income, or better money management. Use language around wealth building, saving money, financial security, and smart investing.",
    "Fitness": "Target audience: people wanting to lose weight, build muscle, or improve health. Use language around transformation, energy, confidence, and achieving body goals.",
    "Health": "Target audience: health-conscious people wanting to feel better and live longer. Use language around wellness, vitality, natural solutions, and prevention.",
    "Beauty": "Target audience: people wanting to look and feel their best. Use language around confidence, glow, transformation, and self-care.",
    "Home Office": "Target audience: remote workers and entrepreneurs wanting a better workspace. Use language around productivity, comfort, professionalism, and work-life balance.",
    "Tech": "Target audience: tech enthusiasts and early adopters. Use language around innovation, performance, cutting-edge features, and solving problems.",
    "Education": "Target audience: people wanting to learn new skills or advance their career. Use language around growth, opportunity, expertise, and future-proofing.",
    "Gaming": "Target audience: gamers wanting better performance and experience. Use language around competitive edge, immersion, performance, and leveling up.",
    "Business": "Target audience: entrepreneurs and business owners. Use language around ROI, growth, scaling, and competitive advantage.",
    "Fashion": "Target audience: style-conscious shoppers wanting to look great. Use language around trends, style, confidence, and self-expression.",
    "Parenting": "Target audience: parents wanting the best for their children. Use language around safety, development, joy, and making memories.",
  };

  const audienceContext = nicheContext[niche] || "Target a broad audience interested in quality products that solve real problems.";

  const prompts: Record<string, string> = {
    tiktok: `You are an expert affiliate marketer specializing in the ${niche} niche. Create a viral TikTok video script for this product. ${audienceContext} Product: ${product.name}. Description: ${product.description}. Price: ${product.price}. Commission: ${product.commissionRate}%. Return a JSON object with these exact fields: { "title": "viral hook title", "scriptText": "full spoken script 60-90 seconds", "caption": "TikTok caption under 150 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5", "thumbnailPrompt": "description for thumbnail", "cta": "call to action" }. Return only valid JSON, no other text.`,
    blog: `You are an expert affiliate content writer specializing in the ${niche} niche. Write a high-converting blog post for this product. ${audienceContext} Product: ${product.name}. Description: ${product.description}. Price: ${product.price}. Return a JSON object with these exact fields: { "title": "SEO blog post title", "scriptText": "full blog post 400-600 words in markdown", "caption": "meta description under 160 chars", "hashtags": "keyword1, keyword2, keyword3", "thumbnailPrompt": "description for featured image", "cta": "call to action" }. Return only valid JSON, no other text.`,
    instagram: `You are an expert affiliate marketer specializing in the ${niche} niche. Create a high-engagement Instagram post for this product. ${audienceContext} Product: ${product.name}. Description: ${product.description}. Price: ${product.price}. Return a JSON object with these exact fields: { "title": "Instagram post hook", "scriptText": "full Instagram caption 150-300 words", "caption": "short version under 125 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8", "thumbnailPrompt": "description for Instagram image", "cta": "call to action" }. Return only valid JSON, no other text.`,
  };

  const prompt = prompts[type];
  if (!prompt) throw new Error("Invalid type");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  return await prisma.content.create({
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
}

router.post("/generate/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  const { type } = req.body;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const content = await generateForProduct(productId, type, anthropic);
    res.json(content);
  } catch (err: any) {
    console.error("Content generation error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to generate content" });
  }
});

router.post("/generate-bulk", requireAuth, async (req, res) => {
  const { types = ["tiktok"], productIds } = req.body;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const products = productIds
      ? await prisma.product.findMany({ where: { id: { in: productIds }, status: "active" } })
      : await prisma.product.findMany({ where: { status: "active" } });

    const results = { created: 0, failed: 0, errors: [] as string[] };

    for (const product of products) {
      for (const type of types) {
        try {
          await generateForProduct(product.id, type, anthropic);
          results.created++;
        } catch (err: any) {
          results.failed++;
          results.errors.push(`${product.name} (${type}): ${err.message}`);
        }
      }
    }

    res.json({
      message: `Bulk generation complete. ${results.created} pieces created, ${results.failed} failed.`,
      ...results,
    });
  } catch (err: any) {
    console.error("Bulk generation error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to bulk generate" });
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