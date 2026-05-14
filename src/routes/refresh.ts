import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/refresh/stale", requireAuth, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const stalePosts = await prisma.content.findMany({
      where: {
        type: "blog",
        status: "published",
        updatedAt: { lte: sixMonthsAgo },
      },
      include: { product: true },
      orderBy: { updatedAt: "asc" },
    });

    res.json({
      total: stalePosts.length,
      posts: stalePosts.map(p => ({
        id: p.id,
        title: p.title,
        productName: p.product.name,
        category: p.product.category,
        postUrl: p.postUrl,
        lastUpdated: p.updatedAt,
        monthsOld: Math.floor((Date.now() - new Date(p.updatedAt).getTime()) / (1000 * 60 * 60 * 24 * 30)),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch stale posts" });
  }
});

router.post("/refresh/:contentId", requireAuth, async (req, res) => {
  const contentId = parseInt(req.params.contentId);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true },
    });

    if (!content) return res.status(404).json({ error: "Content not found" });

    const product = content.product;
    const isComparison = content.title?.toLowerCase().includes("best") && content.title?.toLowerCase().includes("uk");

    const prompt = isComparison ? `You are an expert UK affiliate content writer. Refresh and update this comparison blog post for ${new Date().getFullYear()}.

Title: "${content.title}"
Product: ${product.name}
Category: ${product.category}
Current Price: £${product.price}

Write an updated comparison post that:
1. Updates the year to ${new Date().getFullYear()}
2. Refreshes the intro with current market context
3. Has a quick comparison summary table in HTML
4. Reviews products with pros/cons
5. Has a clear winner recommendation
6. Is 600-900 words
7. Uses UK English
8. Is SEO-optimized

Also generate 5 updated FAQ questions and answers.

Return a JSON object:
{
  "title": "updated title with ${new Date().getFullYear()}",
  "scriptText": "full updated blog post HTML",
  "caption": "updated meta description under 160 chars",
  "hashtags": "keyword1, keyword2, keyword3, keyword4",
  "cta": "compelling call to action",
  "faqs": [
    {"question": "Q1?", "answer": "A1"},
    {"question": "Q2?", "answer": "A2"},
    {"question": "Q3?", "answer": "A3"},
    {"question": "Q4?", "answer": "A4"},
    {"question": "Q5?", "answer": "A5"}
  ]
}

Return only valid JSON.` : `You are an expert UK affiliate content writer. Refresh and update this product blog post.

Product: ${product.name}
Category: ${product.category}
Price: £${product.price}
Description: ${product.description || "Quality UK product"}

Write a fresh updated blog post that:
1. Has a new engaging intro
2. Updates any pricing information
3. Highlights current benefits and features
4. Is 400-600 words
5. Uses UK English
6. Is SEO-optimized for ${new Date().getFullYear()}

Return a JSON object:
{
  "title": "updated SEO title for ${new Date().getFullYear()}",
  "scriptText": "full updated blog post HTML",
  "caption": "updated meta description under 160 chars",
  "hashtags": "keyword1, keyword2, keyword3",
  "cta": "call to action"
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

    // Build FAQ HTML and schema for comparison posts
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
  "mainEntity": [
    ${parsed.faqs.map((f: any) => `{
      "@type": "Question",
      "name": "${f.question.replace(/"/g, '\\"')}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${f.answer.replace(/"/g, '\\"')}"
      }
    }`).join(",")}
  ]
}
</script>` : "";

    const updatedContent = await prisma.content.update({
      where: { id: contentId },
      data: {
        title: parsed.title,
        scriptText: parsed.scriptText + faqHtml + faqSchema,
        caption: parsed.caption,
        hashtags: parsed.hashtags,
        cta: parsed.cta,
        updatedAt: new Date(),
      },
    });

    res.json({
      message: `Content refreshed: "${parsed.title}"`,
      contentId,
      newTitle: parsed.title,
      isComparison,
    });
  } catch (err: any) {
    console.error("Refresh error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to refresh content" });
  }
});

router.post("/refresh-all-stale", requireAuth, async (req, res) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const stalePosts = await prisma.content.findMany({
      where: {
        type: "blog",
        status: "published",
        updatedAt: { lte: sixMonthsAgo },
      },
      include: { product: true },
      take: 10,
    });

    if (stalePosts.length === 0) {
      return res.json({ message: "No stale posts found!", refreshed: 0 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let refreshed = 0;
    let failed = 0;

    for (const post of stalePosts) {
      try {
        const isComparison = post.title?.toLowerCase().includes("best") && post.title?.toLowerCase().includes("uk");
        const prompt = `Refresh this ${isComparison ? "comparison" : "product"} blog post for ${new Date().getFullYear()}. Product: ${post.product.name}. Price: £${post.product.price}. Category: ${post.product.category}. Write updated content. Return JSON: {"title": "updated title", "scriptText": "updated HTML content 400-600 words", "caption": "meta description", "hashtags": "keywords", "cta": "call to action"}. Return only valid JSON.`;

        const message = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        });

        const text = message.content[0].type === "text" ? message.content[0].text : "";
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);

        await prisma.content.update({
          where: { id: post.id },
          data: {
            title: parsed.title,
            scriptText: parsed.scriptText,
            caption: parsed.caption,
            hashtags: parsed.hashtags,
            cta: parsed.cta,
            updatedAt: new Date(),
          },
        });

        refreshed++;
      } catch { failed++; }
    }

    res.json({
      message: `Refreshed ${refreshed} posts, ${failed} failed.`,
      refreshed,
      failed,
      total: stalePosts.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to refresh stale posts" });
  }
});

export default router;