import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

const CATEGORY_MAP: Record<string, number> = {
  "Parenting": 1,
  "Baby & Parenting": 1,
  "baby-parenting": 1,
  "Furniture": 1,
  "Home & Garden": 5,
  "Home Office": 5,
  "home-garden": 5,
  "Pet Care": 6,
  "pet-care": 6,
  "Health & Wellness": 7,
  "Health": 7,
  "Fitness": 7,
  "health-wellness": 7,
  "Tech & AI Tools": 8,
  "Tech": 8,
  "AI Tools": 8,
  "tech-ai-tools": 8,
  "Education": 8,
  "Business": 8,
  "Gaming": 8,
  "Fashion": 1,
  "Beauty": 1,
  "Travel": 1,
  "Food": 5,
};

function getCategoryId(category: string | null): number {
  if (!category) return 1;
  return CATEGORY_MAP[category] || 1;
}

async function buildPostContent(
  name: string,
  slug: string | null,
  affiliateLink: string | null,
  scriptText: string,
  cta: string,
  productImageUrl?: string | null,
  category?: string | null
) {
  const trackingLink = slug
    ? `https://backend-production-c3f5.up.railway.app/track/go/${slug}`
    : affiliateLink || "#";

  // Product image shown inside the buy box only
  const productImageHtml = productImageUrl ? `
<div style="text-align: center; margin: 16px 0;">
  <img src="${productImageUrl}" alt="${name}" style="max-width: 280px; height: auto; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); border: 1px solid #e5e7eb;" />
</div>` : "";

  return `
${scriptText}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 24px; margin: 24px 0; border-radius: 8px; text-align: center;">
  <h3 style="margin: 0 0 8px; font-size: 20px;">Ready to try ${name}?</h3>
  <p style="margin: 0 0 16px; color: #555;">${cta}</p>
  ${productImageHtml}
  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; margin-top: 16px;">Get ${name} →</a>
</div>

<p style="font-size: 12px; color: #999;"><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
  `.trim();
}

router.post("/publish/:contentId", requireAuth, async (req, res) => {
  const contentId = parseInt(req.params.contentId);
  try {
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true },
    });
    if (!content) return res.status(404).json({ error: "Content not found" });
    if (content.type !== "blog") return res.status(400).json({ error: "Only blog content can be published" });
    if (content.status === "published") return res.status(400).json({ error: "Already published" });

    const productCategory = content.product.category || "";
    const wpCategoryId = getCategoryId(productCategory);

    const postContent = await buildPostContent(
      content.product.name,
      content.product.slug,
      content.product.affiliateLink,
      content.scriptText || "",
      content.cta || "",
      content.product.imageUrl,
      productCategory
    );

    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${WP_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: content.title,
        content: postContent,
        status: "publish",
        excerpt: content.caption,
        categories: [wpCategoryId],
      }),
    });

    if (!wpRes.ok) {
      const err = await wpRes.json();
      throw new Error(err.message || "WordPress publish failed");
    }

    const wpPost = await wpRes.json();
    await prisma.content.update({
      where: { id: contentId },
      data: { status: "published", postUrl: wpPost.link },
    });

    res.json({ message: "Published!", postUrl: wpPost.link, postId: wpPost.id, category: productCategory, wpCategoryId });
  } catch (err: any) {
    console.error("WordPress error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to publish" });
  }
});

router.post("/publish-all-blogs", requireAuth, async (req, res) => {
  try {
    const blogs = await prisma.content.findMany({
      where: { type: "blog", status: "draft" },
      include: { product: true },
      take: 20,
    });

    const alreadyPublished = await prisma.content.findMany({
      where: { type: "blog", status: "published" },
      select: { productId: true },
    });
    const publishedProductIds = new Set(alreadyPublished.map(c => c.productId));
    const toPublish = blogs.filter(b => !publishedProductIds.has(b.productId));
    const skipped = blogs.length - toPublish.length;

    const results = { published: 0, failed: 0, skipped, urls: [] as string[], categories: [] as string[] };

    for (const blog of toPublish) {
      try {
        const productCategory = blog.product.category || "";
        const wpCategoryId = getCategoryId(productCategory);

        const postContent = await buildPostContent(
          blog.product.name,
          blog.product.slug,
          blog.product.affiliateLink,
          blog.scriptText || "",
          blog.cta || "",
          blog.product.imageUrl,
          productCategory
        );

        const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${WP_AUTH}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: blog.title,
            content: postContent,
            status: "publish",
            excerpt: blog.caption,
            categories: [wpCategoryId],
          }),
        });

        if (!wpRes.ok) throw new Error("Failed");
        const wpPost = await wpRes.json();
        await prisma.content.update({
          where: { id: blog.id },
          data: { status: "published", postUrl: wpPost.link },
        });
        results.published++;
        results.urls.push(wpPost.link);
        results.categories.push(`${blog.product.name} → ${productCategory} (cat ${wpCategoryId})`);
      } catch { results.failed++; }
    }

    res.json({
      message: `Published ${results.published} posts, ${results.skipped} skipped (already published), ${results.failed} failed.`,
      ...results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to bulk publish" });
  }
});

router.post("/reset-published", requireAuth, async (req, res) => {
  try {
    const result = await prisma.content.updateMany({
      where: { type: "blog", status: "published" },
      data: { status: "draft", postUrl: null },
    });
    res.json({
      message: `Reset ${result.count} published posts back to draft.`,
      count: result.count,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to reset posts" });
  }
});

router.get("/categories", requireAuth, async (req, res) => {
  try {
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/categories?per_page=20`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const cats = await wpRes.json();
    res.json(cats);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch categories" });
  }
});

router.get("/posts", requireAuth, async (req, res) => {
  try {
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const posts = await wpRes.json();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch posts" });
  }
});

export default router;