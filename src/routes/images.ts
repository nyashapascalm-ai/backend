import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

const CATEGORY_IMAGE_QUERIES: Record<string, string[]> = {
  "Baby & Parenting": ["baby nursery crib", "baby toys newborn", "mother baby happy", "baby clothes products"],
  "Parenting": ["baby nursery crib", "mother baby happy", "baby products"],
  "Furniture": ["nursery furniture baby room", "baby crib bedroom"],
  "Nursery": ["nursery furniture baby room", "baby crib cozy"],
  "Home & Garden": ["home interior living room", "garden flowers", "home decor lifestyle"],
  "Home Office": ["home office desk workspace", "laptop working from home"],
  "Bedding": ["bedroom bedding pillows", "cozy bed sheets"],
  "Kitchen": ["kitchen cooking lifestyle", "modern kitchen home"],
  "Pet Care": ["dog pet happy", "cat pet lifestyle", "pet products"],
  "Pets": ["dog pet happy", "cat pet lifestyle"],
  "Health & Wellness": ["health wellness spa", "yoga fitness wellness", "beauty skincare"],
  "Health": ["health wellness lifestyle", "healthy living"],
  "Wellness": ["wellness spa relaxation", "yoga meditation"],
  "Beauty": ["beauty skincare products", "makeup cosmetics"],
  "Fitness": ["gym fitness workout", "running exercise healthy"],
  "Tech & AI Tools": ["technology laptop modern", "smartphone tech gadget"],
  "Tech": ["technology laptop modern", "smartphone gadget"],
  "AI Tools": ["technology laptop modern", "software coding"],
  "Finance and Insurance": ["finance money savings", "insurance protection family"],
  "Finance": ["finance money savings", "banking investment"],
  "Insurance": ["insurance protection family", "finance savings"],
  "Travel and Outdoors": ["travel adventure nature", "outdoor hiking landscape"],
  "Travel": ["travel adventure nature", "holiday destination"],
  "Outdoors": ["outdoor hiking landscape", "nature adventure"],
  "Start up and Investment": ["business startup entrepreneur", "investment growth success"],
  "Startup": ["business startup entrepreneur", "office team work"],
  "Investment": ["investment growth success", "finance business"],
  "Fashion": ["fashion clothing style", "outfit lifestyle"],
  "Education": ["education learning books", "student studying"],
  "Business": ["business professional office", "entrepreneur success"],
  "Gaming": ["gaming setup computer", "game controller"],
  "Software": ["technology laptop coding", "software development"],
  "Baby Products": ["baby nursery crib", "baby toys newborn", "mother baby happy"],
  "Baby Toys": ["baby toys children playing", "infant toys colorful"],
  "Baby Clothes": ["baby clothes newborn", "infant clothing cute"],
  "Baby Clothes & Accessories": ["baby clothes newborn", "infant accessories"],
  "General Household": ["home interior cozy", "household lifestyle"],
  "Toys": ["children toys playing", "kids toys colorful"],
};

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
): Promise<{ url: string; description: string; photographer: string; photographerUsername: string } | null> {
  try {
    const page = Math.floor(Math.random() * 3) + 1;
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&page=${page}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await res.json();
    if (!data.results?.length) return null;
    for (const photo of data.results) {
      if (!usedUrls.has(photo.urls.regular)) {
        return {
          url: photo.urls.regular,
          description: photo.description || photo.alt_description || query,
          photographer: photo.user.name,
          photographerUsername: photo.user.username,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function uploadImageToWordPress(
  imageUrl: string,
  title: string,
  photographer: string,
  photographerUsername: string
): Promise<number | null> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
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
    const attribution = `Photo by <a href="https://unsplash.com/@${photographerUsername}?utm_source=mumdeals&utm_medium=referral">${photographer}</a> on <a href="https://unsplash.com/?utm_source=mumdeals&utm_medium=referral">Unsplash</a>`;
    await fetch(`${WP_URL}/wp-json/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: { Authorization: `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
      body: JSON.stringify({ alt_text: title, caption: attribution }),
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
      headers: { Authorization: `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
      body: JSON.stringify({ featured_media: mediaId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getCategoryQuery(category: string, title?: string): string {
  // Check exact category match first
  if (CATEGORY_IMAGE_QUERIES[category]) {
    const queries = CATEGORY_IMAGE_QUERIES[category];
    return queries[Math.floor(Math.random() * queries.length)];
  }
  // Check if category contains keywords
  const cat = category.toLowerCase();
  if (cat.includes("baby") || cat.includes("infant") || cat.includes("newborn") || cat.includes("toddler")) {
    const q = ["baby nursery crib", "baby toys newborn", "mother baby happy"];
    return q[Math.floor(Math.random() * q.length)];
  }
  if (cat.includes("toy") || cat.includes("play")) return "baby toys children playing";
  if (cat.includes("furniture") || cat.includes("cot") || cat.includes("crib") || cat.includes("wardrobe") || cat.includes("dresser")) return "nursery furniture baby room";
  if (cat.includes("cloth") || cat.includes("wear") || cat.includes("dress") || cat.includes("mitten") || cat.includes("scratch")) return "baby clothes newborn";
  if (cat.includes("parenting") || cat.includes("nursery")) return "mother baby happy";
  if (cat.includes("home") || cat.includes("bedding") || cat.includes("duvet") || cat.includes("curtain")) return "home interior bedroom";
  if (cat.includes("garden") || cat.includes("outdoor")) return "garden flowers lifestyle";
  if (cat.includes("pet") || cat.includes("dog") || cat.includes("cat")) return "dog pet happy";
  if (cat.includes("health") || cat.includes("wellness") || cat.includes("beauty") || cat.includes("fitness")) return "health wellness spa";
  if (cat.includes("tech") || cat.includes("software") || cat.includes("ai") || cat.includes("digital")) return "technology laptop modern";
  if (cat.includes("travel") || cat.includes("holiday")) return "travel adventure nature";
  if (cat.includes("finance") || cat.includes("insurance") || cat.includes("money") || cat.includes("banking")) return "finance money savings";
  if (cat.includes("fashion") || cat.includes("style") || cat.includes("cloth")) return "fashion clothing lifestyle";
  if (cat.includes("general") || cat.includes("household")) return "home interior cozy";
  // Title-based fallback
  if (title) {
    const t = title.toLowerCase();
    if (t.includes("baby") || t.includes("nursery") || t.includes("pram") || t.includes("pushchair") || t.includes("monitor") || t.includes("nappy") || t.includes("sleeping bag")) return "baby nursery crib";
    if (t.includes("home") || t.includes("garden") || t.includes("bedding") || t.includes("duvet")) return "home interior living room";
    if (t.includes("pet") || t.includes("dog") || t.includes("cat")) return "dog pet happy";
    if (t.includes("health") || t.includes("wellness") || t.includes("ipl") || t.includes("hair removal")) return "health wellness spa";
    if (t.includes("travel") || t.includes("insurance") || t.includes("theatre")) return "travel adventure nature";
    if (t.includes("iso") || t.includes("training") || t.includes("course")) return "business startup entrepreneur";
    if (t.includes("broadband") || t.includes("internet") || t.includes("tech") || t.includes("ai")) return "technology laptop modern";
    if (t.includes("flower") || t.includes("preserved")) return "flowers bouquet lifestyle";
  }
  return "lifestyle shopping product";
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
        await prisma.content.update({ where: { id: content.id }, data: { postUrl: newUrl } });
        fixed++;
      }
    }
    res.json({ message: `Fixed ${fixed} post URLs.`, fixed, total: published.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fix URLs" });
  }
});

router.post("/reset-featured-images", requireAuth, async (req, res) => {
  try {
    const wpRes1 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&page=1`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpRes2 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&page=2`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const posts1 = await wpRes1.json();
    const posts2 = wpRes2.ok ? await wpRes2.json() : [];
    const allPosts = [
      ...(Array.isArray(posts1) ? posts1 : []),
      ...(Array.isArray(posts2) ? posts2 : []),
    ];
    let reset = 0;
    for (const post of allPosts) {
      if (post.featured_media && post.featured_media > 0) {
        await fetch(`${WP_URL}/wp-json/wp/v2/posts/${post.id}`, {
          method: "POST",
          headers: { Authorization: `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
          body: JSON.stringify({ featured_media: 0 }),
        });
        reset++;
      }
    }
    res.json({ message: `Reset featured images on ${reset} posts. Now run add-featured-images.`, reset });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to reset" });
  }
});

router.post("/add-featured-images", requireAuth, async (req, res) => {
  try {
    const publishedContent = await prisma.content.findMany({
      where: { type: "blog", status: "published" },
      include: { product: true },
    });
    const results = { updated: 0, failed: 0, skipped: 0 };
    const usedImageUrls = new Set<string>();
    const wpRes1 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc&page=1`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpPosts1 = await wpRes1.json();
    const wpRes2 = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc&page=2`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const wpPosts2 = wpRes2.ok ? await wpRes2.json() : [];
    const wpPosts = [
      ...(Array.isArray(wpPosts1) ? wpPosts1 : []),
      ...(Array.isArray(wpPosts2) ? wpPosts2 : []),
    ];
    for (const content of publishedContent) {
      try {
        const wpPost = wpPosts.find((p: any) =>
          normalizeUrl(p.link) === normalizeUrl(content.postUrl) ||
          normalizeTitle(p.title?.rendered) === normalizeTitle(content.title)
        );
        if (!wpPost) { results.skipped++; continue; }
        if (wpPost.featured_media && wpPost.featured_media > 0) { results.skipped++; continue; }
        const category = content.product.category || "lifestyle";
        const searchQuery = getCategoryQuery(category, content.title || content.product.name);
        let image = await searchUnsplashImage(searchQuery, usedImageUrls);
        if (!image) image = await searchUnsplashImage(getCategoryQuery(category, content.title || ""), usedImageUrls);
        if (!image) image = await searchUnsplashImage("lifestyle shopping", usedImageUrls);
        if (!image) { results.failed++; continue; }
        usedImageUrls.add(image.url);
        const mediaId = await uploadImageToWordPress(image.url, content.product.name, image.photographer, image.photographerUsername);
        if (!mediaId) { results.failed++; continue; }
        const success = await setFeaturedImage(wpPost.id, mediaId);
        if (success) results.updated++;
        else results.failed++;
        await new Promise(r => setTimeout(r, 1200));
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
    const image = await searchUnsplashImage(query || "lifestyle");
    if (!image) return res.status(404).json({ error: "No image found" });
    const mediaId = await uploadImageToWordPress(image.url, query, image.photographer, image.photographerUsername);
    if (!mediaId) return res.status(500).json({ error: "Failed to upload image" });
    const success = await setFeaturedImage(parseInt(postId), mediaId);
    if (!success) return res.status(500).json({ error: "Failed to set featured image" });
    res.json({ message: "Featured image added!", imageUrl: image.url, photographer: image.photographer, mediaId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed" });
  }
});

export default router;