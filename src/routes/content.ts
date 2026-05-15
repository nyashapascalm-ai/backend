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
    "AI Tools": "Target audience: entrepreneurs, content creators, and tech-savvy professionals who want to save time and boost productivity.",
    "Tech & AI Tools": "Target audience: entrepreneurs and tech professionals. Use language around productivity, ROI, automation, and competitive advantage.",
    "Finance": "Target audience: people wanting financial freedom or better money management.",
    "Finance and Insurance": "Target audience: people wanting financial freedom, better money management or travel protection.",
    "Fitness": "Target audience: people wanting to lose weight, build muscle, or improve health.",
    "Health": "Target audience: health-conscious people wanting to feel better.",
    "Health & Wellness": "Target audience: health-conscious people wanting to feel better and live longer.",
    "Beauty": "Target audience: people wanting to look and feel their best.",
    "Home & Garden": "Target audience: homeowners wanting a beautiful, functional home.",
    "Home Office": "Target audience: remote workers and entrepreneurs wanting a better workspace.",
    "Education": "Target audience: people wanting to learn new skills or advance their career.",
    "Gaming": "Target audience: gamers wanting better performance and experience.",
    "Business": "Target audience: entrepreneurs and business owners.",
    "Fashion": "Target audience: style-conscious shoppers wanting to look great.",
    "Parenting": "Target audience: parents wanting the best for their children.",
    "Baby & Parenting": "Target audience: parents wanting the best for their children. Use language around safety, development, joy, and making memories.",
    "Furniture": "Target audience: parents setting up a nursery or home. Use language around safety, quality, and value.",
    "Baby Products": "Target audience: parents wanting the best baby essentials. Use language around safety, comfort, and development.",
    "Baby Toys": "Target audience: parents wanting engaging, safe toys for their babies.",
    "Baby Clothes": "Target audience: parents wanting comfortable, quality clothing for their babies.",
    "General Household": "Target audience: homeowners wanting quality household products.",
    "Toys": "Target audience: parents and gift-givers wanting fun, educational toys.",
    "Pet Care": "Target audience: pet owners who treat their pets like family.",
    "Travel and Outdoors": "Target audience: adventure seekers and families wanting to explore the world.",
    "Start up and Investment": "Target audience: entrepreneurs and investors wanting to grow their wealth and business.",
  };

  const audienceContext = nicheContext[niche] || "Target a broad UK audience interested in quality products.";

  const prompts: Record<string, string> = {
    tiktok: `You are an expert affiliate marketer specializing in the ${niche} niche. Create a viral TikTok video script for this product. ${audienceContext} Product: ${product.name}. Description: ${product.description}. Price: ${product.price}. Commission: ${product.commissionRate}%. Return a JSON object with these exact fields: { "title": "viral hook title", "scriptText": "full spoken script 60-90 seconds", "caption": "TikTok caption under 150 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5", "thumbnailPrompt": "description for thumbnail", "cta": "call to action" }. Return only valid JSON, no other text.`,
    blog: `You are an expert UK affiliate content writer specializing in the ${niche} niche. Write a high-converting blog post for this product. ${audienceContext}

Product: ${product.name}
Description: ${product.description}
Price: £${product.price}
Category: ${niche}

Write a blog post that:
1. Has an engaging UK-focused intro
2. Covers key features and benefits
3. Explains why UK buyers should choose this product
4. Has a clear recommendation
5. Is 400-600 words
6. Uses UK English throughout
7. Is SEO-optimized for ${new Date().getFullYear()}

The content MUST be specifically about: ${product.name}
Do NOT write about any other product.

Return a JSON object with these exact fields:
{
  "title": "SEO blog post title mentioning ${product.name.split(" ").slice(0, 4).join(" ")} UK ${new Date().getFullYear()}",
  "scriptText": "full blog post HTML content about ${product.name}",
  "caption": "meta description under 160 chars",
  "hashtags": "keyword1, keyword2, keyword3",
  "thumbnailPrompt": "description for featured image",
  "cta": "call to action"
}
Return only valid JSON, no other text.`,
    instagram: `You are an expert affiliate marketer specializing in the ${niche} niche. Create a high-engagement Instagram post for this product. ${audienceContext} Product: ${product.name}. Description: ${product.description}. Price: £${product.price}. Return a JSON object with these exact fields: { "title": "Instagram post hook", "scriptText": "full Instagram caption 150-300 words", "caption": "short version under 125 chars", "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7 #tag8", "thumbnailPrompt": "description for Instagram image", "cta": "call to action" }. Return only valid JSON, no other text.`,
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

    const existingContent = await prisma.content.findMany({
      where: {
        type: { in: types },
        productId: { in: products.map(p => p.id) },
      },
      select: { productId: true, type: true },
    });

    const existingSet = new Set(existingContent.map(c => `${c.productId}-${c.type}`));
    const results = { created: 0, failed: 0, skipped: 0, errors: [] as string[] };

    for (const product of products) {
      for (const type of types) {
        const key = `${product.id}-${type}`;
        if (existingSet.has(key)) { results.skipped++; continue; }
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
      message: `Bulk generation complete. ${results.created} pieces created, ${results.skipped} skipped (already exist), ${results.failed} failed.`,
      ...results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to bulk generate" });
  }
});

router.post("/generate-comparison", requireAuth, async (req, res) => {
  const { category, maxPrice, title: customTitle, productIds } = req.body;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    let products;
    if (productIds?.length) {
      products = await prisma.product.findMany({ where: { id: { in: productIds }, status: "active" } });
    } else {
      products = await prisma.product.findMany({
        where: {
          status: "active",
          ...(category ? { category } : {}),
          ...(maxPrice ? { price: { lte: parseFloat(maxPrice) } } : {}),
        },
        take: 8,
      });
      if (products.length < 2 && maxPrice) {
        products = await prisma.product.findMany({
          where: { status: "active", ...(category ? { category } : {}) },
          take: 8,
        });
      }
      if (products.length < 2) {
        products = await prisma.product.findMany({ where: { status: "active" }, take: 8 });
      }
    }

    if (products.length < 2) {
      return res.status(400).json({ error: "Not enough active products to generate a comparison post" });
    }

    const productList = products.map((p, i) =>
      `${i + 1}. ${p.name} — £${p.price} — ${p.description || "No description"}`
    ).join("\n");

    const postTitle = customTitle || `Best ${category || "Products"} Under £${maxPrice || "500"} UK ${new Date().getFullYear()}`;

    const prompt = `You are an expert UK affiliate content writer. Write a high-converting comparison blog post.

Title: "${postTitle}"

Products to compare:
${productList}

Write a detailed comparison post that:
1. Starts with an engaging intro explaining why these products matter
2. Has a quick comparison summary table in HTML
3. Reviews each product with pros/cons
4. Has a clear winner recommendation at the end
5. Is 600-900 words total
6. Uses UK English
7. Is SEO-optimized for the title keywords

Also generate 5 FAQ questions and answers about these products.

Return a JSON object:
{
  "title": "${postTitle}",
  "scriptText": "full blog post HTML content",
  "caption": "meta description under 160 chars",
  "hashtags": "keyword1, keyword2, keyword3, keyword4",
  "thumbnailPrompt": "description for featured image",
  "cta": "compelling call to action",
  "faqs": [
    {"question": "Q1?", "answer": "A1"},
    {"question": "Q2?", "answer": "A2"},
    {"question": "Q3?", "answer": "A3"},
    {"question": "Q4?", "answer": "A4"},
    {"question": "Q5?", "answer": "A5"}
  ]
}
Return only valid JSON.`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    const faqHtml = parsed.faqs?.length ? `
<div class="faq-section" style="margin-top: 32px;">
  <h2 style="font-size: 24px; margin-bottom: 16px;">Frequently Asked Questions</h2>
  ${parsed.faqs.map((f: any) => `
  <div style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px;">
    <h3 style="margin: 0 0 8px; font-size: 16px; color: #1a1a2e;">${f.question}</h3>
    <p style="margin: 0; color: #555; line-height: 1.6;">${f.answer}</p>
  </div>`).join("")}
</div>` : "";

    const faqSchema = parsed.faqs?.length ? `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [${parsed.faqs.map((f: any) => `{
    "@type": "Question",
    "name": "${f.question.replace(/"/g, '\\"')}",
    "acceptedAnswer": { "@type": "Answer", "text": "${f.answer.replace(/"/g, '\\"')}" }
  }`).join(",")}]
}
</script>` : "";

    const categoryProduct = products.find(p => p.category === category) || products[0];

    const content = await prisma.content.create({
      data: {
        productId: categoryProduct.id,
        type: "blog",
        title: parsed.title,
        scriptText: parsed.scriptText + faqHtml + faqSchema,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        thumbnailPrompt: parsed.thumbnailPrompt,
        cta: parsed.cta,
        status: "draft",
      },
    });

    res.json({
      message: `Comparison post generated: "${parsed.title}"`,
      content,
      productsCompared: products.length,
      productNames: products.map(p => p.name),
      faqCount: parsed.faqs?.length || 0,
    });
  } catch (err: any) {
    console.error("Comparison generation error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to generate comparison post" });
  }
});

router.post("/delete-all", requireAuth, async (req, res) => {
  try {
    const result = await prisma.content.deleteMany({
      where: { type: "blog", sponsored: false },
    });
    res.json({ message: `Deleted ${result.count} blog posts from database. Ready to regenerate fresh.`, count: result.count });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to delete content" });
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