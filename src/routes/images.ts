import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

async function searchUnsplashImage(query: string): Promise<{ url: string; description: string; photographer: string } | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await res.json();
    if (!data.results?.length) return null;
    const photo = data.results[0];
    return {
      url: photo.urls.regular,
      description: photo.description || photo.alt_description || query,
      photographer: photo.user.name,
    };
  } catch {
    return null;
  }
}

async function uploadImageToWordPress(imageUrl: string, title: string, altText: string): Promise<number | null> {
  try {
    const imgRes = await fetch(imageUrl);
    const imgBuffer = await imgRes.arrayBuffer();
    const imgBytes = Buffer.from(imgBuffer);
    const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + ".jpg";
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${WP_AUTH}`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "image/jpeg",
      },
      body: imgBytes,
    });
    if (!wpRes.ok) {
      const err = await wpRes.json();
      throw new Error(err.message || "Media upload failed");
    }
    const media = await wpRes.json();
    await fetch(`${WP_URL}/wp-json/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${WP_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alt_text: altText, caption: `Photo by ${altText} on Unsplash` }),
    });
    return media.id;
  } catch (err: any) {
    console.error("Image upload error:", err?.message);
    return null;
  }
}

async function setFeaturedImage(postId: number, mediaId: number): Promise<boolean> {
  try {
    const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts/${postId}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${WP_AUTH}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ featured_media: mediaId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

router.post("/add-featured-images", requireAuth, async (req, res) => {
  try {
    const publishedContent = await prisma.content.findMany({
      where: { type: "blog", status: "published" },
      include: { product: true },
    });

    const results = { updated: 0, failed: 0, skipped: 0 };

    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpPosts = await wpRes.json();

    for (const content of publishedContent) {
      try {
        const wpPost = wpPosts.find((p: any) =>
          p.title.rendered === content.title ||
          p.link === content.postUrl
        );

        if (!wpPost) { results.skipped++; continue; }

        if (wpPost.featured_media && wpPost.featured_media > 0) {
          results.skipped++;
          continue;
        }

        const searchQuery = `${content.product.category || ""} ${content.product.name}`.trim();
        const image = await searchUnsplashImage(searchQuery);
        if (!image) { results.failed++; continue; }

        const mediaId = await uploadImageToWordPress(image.url, content.product.name, image.photographer);
        if (!mediaId) { results.failed++; continue; }

        const success = await setFeaturedImage(wpPost.id, mediaId);
        if (success) results.updated++;
        else results.failed++;

        await new Promise(r => setTimeout(r, 1000));
      } catch {
        results.failed++;
      }
    }

    res.json({
      message: `Added featured images to ${results.updated} posts, ${results.skipped} skipped, ${results.failed} failed.`,
      ...results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to add featured images" });
  }
});

router.post("/add-image/:postId", requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { query } = req.body;
  try {
    const image = await searchUnsplashImage(query || "baby parenting");
    if (!image) return res.status(404).json({ error: "No image found" });

    const mediaId = await uploadImageToWordPress(image.url, query, image.photographer);
    if (!mediaId) return res.status(500).json({ error: "Failed to upload image" });

    const success = await setFeaturedImage(parseInt(postId), mediaId);
    if (!success) return res.status(500).json({ error: "Failed to set featured image" });

    res.json({
      message: "Featured image added!",
      imageUrl: image.url,
      photographer: image.photographer,
      mediaId,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed" });
  }
});

export default router;