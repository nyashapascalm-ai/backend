import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const WP_URL = process.env.WP_URL || "https://hotpink-jay-474959.hostingersite.com";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

// Map product category to WordPress category ID
// These IDs come from your WordPress instance
const CATEGORY_MAP: Record<string, number> = {
  "Parenting": 1,
  "Baby & Parenting": 1,
  "baby-parenting": 1,
  "Home & Garden": 2,
  "Home Office": 2,
  "Pet Care": 3,
  "Health & Wellness": 4,
  "Health": 4,
  "Fitness": 4,
  "Tech & AI Tools": 5,
  "Tech": 5,
  "AI Tools": 5,
};

// Map product category to Pinterest board
const PINTEREST_BOARD_MAP: Record<string, string> = {
  "Parenting": "mumcircle3/baby-parenting-deals",
  "Baby & Parenting": "mumcircle3/baby-parenting-deals",
  "Home & Garden": "mumcircle3/baby-parenting-deals",
  "Pet Care": "mumcircle3/baby-parenting-deals",
  "Health & Wellness": "mumcircle3/baby-parenting-deals",
  "Tech & AI Tools": "mumcircle3/baby-parenting-deals",
};

function getCategoryId(category: string | null): number {
  if (!category) return 1;
  return CATEGORY_MAP[category] || 1;
}

async function getWpCategoryIds(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/categories?per_page=20`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const cats = await res.json();
    const map: Record<string, number> = {};
    for (const cat of cats) {
      map[cat.slug] = cat.id;
      map[cat.name] = cat.id;
    }
    return map;
  } catch {
    return {};
  }
}

async function buildPostContent(name: string, slug: string | null, affiliateLink: string | null, scriptText: string, cta: string) {
  const trackingLink = slug
    ? `https://backend-production-c3f5.up.railway.app/track/go/${slug}`
    : affiliateLink || "#";

  return `
${scriptText}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin: 0 0 10px;">Ready to try ${name}?</h3>
  <p style="margin: 0 0 15px;">${cta}</p>
  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Get ${name} →</a>
</div>

<p><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
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

    const categoryIds = await getWpCategoryIds();
    const productCategory = content.product.category || "";
    const wpCategoryId = categoryIds[productCategory] || categoryIds["baby-parenting"] || 1;

    const postContent = await buildPostContent(
      content.product.name,
      content.product.slug,
      content.product.affiliateLink,
      content.scriptText || "",
      content.cta || ""
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

    res.json({ message: "Published!", postUrl: wpPost.link, postId: wpPost.id, category: productCategory });
  } catch (err: any) {
    console.error("WordPress error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to publish" });
  }
});

router.post("/publish-all-blogs", requireAuth, async (req, res) => {
  try {
    const categoryIds = await getWpCategoryIds();

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

    const results = { published: 0, failed: 0, skipped, urls: [] as string[] };

    for (const blog of toPublish) {
      try {
        const productCategory = blog.product.category || "";
        const wpCategoryId = categoryIds[productCategory] || categoryIds["baby-parenting"] || 1;

        const postContent = await buildPostContent(
          blog.product.name,
          blog.product.slug,
          blog.product.affiliateLink,
          blog.scriptText || "",
          blog.cta || ""
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

router.get("/categories", requireAuth, async (req, res) => {
  try {
    const categoryIds = await getWpCategoryIds();
    res.json(categoryIds);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch categories" });
  }
});

router.get("/posts", requireAuth, async (req, res) => {
  try {
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=20&orderby=date&order=desc`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const posts = await wpRes.json();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch posts" });
  }
});

export default router;