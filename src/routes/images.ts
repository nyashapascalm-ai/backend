import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

function normalizeUrl(url: string | null | undefined): string {
  return (url || "").replace(/\/$/, "").toLowerCase().trim();
}

function normalizeTitle(title: string | null | undefined): string {
  return (title || "")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

async function searchUnsplashImage(
  query: string,
  usedUrls: Set<string> = new Set()
): Promise<{ url: string; description: string; photographer: string } | null> {
  try {
    // Try up to 5 different pages/results to find a unique image
    for (let attempt = 0; attempt < 5; attempt++) {
      const page = Math.floor(Math.random() * 8) + 1;
      const perPage = 10;

      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
      );
      const data = await res.json();
      if (!data.results?.length) continue;

      // Shuffle results for more variety
      const shuffled = [...data.results].sort(() => Math.random() - 0.5);

      for (const photo of shuffled) {
        const url = photo.urls.regular;
        if (!usedUrls.has(url)) {
          return {
            url,
            description: photo.description || photo.alt_description || query,
            photographer: photo.user.name,
          };
        }
      }
    }
    return null;
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

router.post("/fix-post-urls", requireAuth, async (req, res) => {
  try {
    const published = await prisma.content.findMany({
      where: { type: "blog", status: "published" },
    });

    let fixed = 0;
    for (const content of published) {
      if (content.postUrl?.includes("hostingersite.com")) {
        const newUrl = content.postUrl.replace(
          "https://hotpink-jay-474959.hostingersite.com",
          "https://mumdeals.co.uk"
        );
        await prisma.content.update({
          where: { id: content.id },
          data: { postUrl: newUrl },
        });
        fixed++;
      }
    }

    res.json({
      message: `Fixed ${fixed} post URLs from hostingersite.com to mumdeals.co.uk`,
      fixed,
      total: published.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fix URLs" });
  }
});

router.post("/add-featured-images", requireAuth, async (req, res) => {
  try {
    const publishedContent = await prisma.content.findMany({
      where: { type: "blog", status: "published" },
      include: { product: true },
    });

    const results = { updated: 0, failed: 0, skipped: 0 };
    const usedImageUrls = new Set<string>(); // Track used images to prevent duplicates

    // Fetch WordPress posts in batches of 100
    const wpRes1 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc&page=1`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpPosts1 = await wpRes1.json();

    const wpRes2 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc&page=2`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpPosts2 = wpRes2.ok ? await wpRes2.json() : [];

    const wpPosts = [...(Array.isArray(wpPosts1) ? wpPosts1 : []), ...(Array.isArray(wpPosts2) ? wpPosts2 : [])];

    for (const content of publishedContent) {
      try {
        const wpPost = wpPosts.find((p: any) =>
          normalizeUrl(p.link) === normalizeUrl(content.postUrl) ||
          normalizeTitle(p.title?.rendered) === normalizeTitle(content.title)
        );

        if (!wpPost) {
          results.skipped++;
          continue;
        }

        if (wpPost.featured_media && wpPost.featured_media > 0) {
          results.skipped++;
          continue;
        }

        // Search with product name + category for uniqueness
        const searchQuery = `${content.product.category || "lifestyle"} ${content.product.name}`.trim();
        let image = await searchUnsplashImage(searchQuery, usedImageUrls);

        // Fallback to category only if no unique image found
        if (!image) {
          image = await searchUnsplashImage(content.product.category || "lifestyle", usedImageUrls);
        }

        // Last resort fallback
        if (!image) {
          image = await searchUnsplashImage("product lifestyle photography", usedImageUrls);
        }

        if (!image) { results.failed++; continue; }

        // Track this URL as used
        usedImageUrls.add(image.url);

        const mediaId = await uploadImageToWordPress(image.url, content.product.name, image.photographer);
        if (!mediaId) { results.failed++; continue; }

        const success = await setFeaturedImage(wpPost.id, mediaId);
        if (success) results.updated++;
        else results.failed++;

        await new Promise(r => setTimeout(r, 800));
      } catch (err: any) {
        console.error(`Image error for ${content.title}:`, err?.message);
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