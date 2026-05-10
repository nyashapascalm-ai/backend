import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

router.post("/publish/:contentId", requireAuth, async (req, res) => {
  const contentId = parseInt(req.params.contentId);
  try {
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      include: { product: true },
    });
    if (!content) return res.status(404).json({ error: "Content not found" });
    if (content.type !== "blog") return res.status(400).json({ error: "Only blog content can be published" });

    const trackingLink = content.product.slug
      ? `https://backend-production-c3f5.up.railway.app/track/go/${content.product.slug}`
      : content.product.affiliateLink || "#";

    const postContent = `
${content.scriptText}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin: 0 0 10px;">Ready to try ${content.product.name}?</h3>
  <p style="margin: 0 0 15px;">${content.cta}</p>
  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Get ${content.product.name} →</a>
</div>

<p><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
    `.trim();

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

    res.json({ message: "Published!", postUrl: wpPost.link, postId: wpPost.id });
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
      take: 10,
    });

    const results = { published: 0, failed: 0, urls: [] as string[] };

    for (const blog of blogs) {
      try {
        const trackingLink = blog.product.slug
          ? `https://backend-production-c3f5.up.railway.app/track/go/${blog.product.slug}`
          : blog.product.affiliateLink || "#";

        const postContent = `
${blog.scriptText}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0; border-radius: 4px;">
  <h3 style="margin: 0 0 10px;">Ready to try ${blog.product.name}?</h3>
  <p style="margin: 0 0 15px;">${blog.cta}</p>
  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">Get ${blog.product.name} →</a>
</div>

<p><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
        `.trim();

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

    res.json({ message: `Published ${results.published} posts, ${results.failed} failed.`, ...results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to bulk publish" });
  }
});

router.get("/posts", requireAuth, async (req, res) => {
  try {
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=10&orderby=date&order=desc`, {
      headers: { "Authorization": `Basic ${WP_AUTH}` },
    });
    const posts = await wpRes.json();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch posts" });
  }
});

export default router;