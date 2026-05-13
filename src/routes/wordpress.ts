import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");

const CATEGORY_MAP: Record<string, number> = {
  "Baby & Parenting": 1,
  "baby-parenting": 1,
  "Parenting": 1,
  "Baby": 1,
  "Furniture": 1,
  "Nursery": 1,
  "Fashion": 1,
  "Beauty": 1,
  "Home & Garden": 5,
  "Home Office": 5,
  "home-garden": 5,
  "Bedding": 5,
  "Food": 5,
  "Garden": 5,
  "Kitchen": 5,
  "Pet Care": 6,
  "pet-care": 6,
  "Pets": 6,
  "Health & Wellness": 7,
  "health-wellness": 7,
  "Health": 7,
  "Fitness": 7,
  "Wellness": 7,
  "Tech & AI Tools": 8,
  "tech-ai-tools": 8,
  "Tech": 8,
  "AI Tools": 8,
  "Education": 8,
  "Business": 8,
  "Gaming": 8,
  "Software": 8,
  "Finance and Insurance": 17,
  "finance-and-insurance": 17,
  "Finance": 17,
  "Insurance": 17,
  "Money": 17,
  "Banking": 17,
  "Start up and Investment": 19,
  "start-up-and-investment": 19,
  "Startup": 19,
  "Investment": 19,
  "Entrepreneur": 19,
  "Travel and Outdoors": 18,
  "travel-and-outdoors": 18,
  "Travel": 18,
  "Outdoors": 18,
  "Adventure": 18,
};

function getCategoryId(category: string | null, title?: string | null): number {
  if (title) {
    const t = title.toLowerCase();
    if (t.includes("baby") || t.includes("nursery") || t.includes("sleeping bag") || t.includes("pram") || t.includes("carrier") || t.includes("parenting") || t.includes("toddler") || t.includes("newborn") || t.includes("monitor") || t.includes("nappy") || t.includes("pushchair")) return 1;
    if (t.includes("tyre") || t.includes("tire") || t.includes("flower") || t.includes("sofa") || t.includes("home office") || t.includes("bedding") || t.includes("kitchen") || t.includes("bedroom") || t.includes("home garden") || t.includes("garden tool")) return 5;
    if (t.includes("pet") || t.includes("dog") || t.includes("cat") || t.includes("puppy") || t.includes("kitten")) return 6;
    if (t.includes("health") || t.includes("wellness") || t.includes("fitness") || t.includes("beauty") || t.includes("hair removal") || t.includes("ipl") || t.includes("weight loss")) return 7;
    if (t.includes("broadband") || t.includes("internet") || t.includes("ai tool") || t.includes("software tool") || t.includes("tech gadget")) return 8;
    if (t.includes("travel insurance") || t.includes("cover for") || t.includes("life insurance") || t.includes("car insurance") || t.includes("finance") || t.includes("insurance")) return 17;
    if (t.includes("iso") || t.includes("certification") || t.includes("startup") || t.includes("entrepreneur") || t.includes("investment") || t.includes("business course")) return 19;
    if (t.includes("travel") || t.includes("outdoor") || t.includes("holiday") || t.includes("theatre ticket") || t.includes("adventure") || t.includes("hiking")) return 18;
  }
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category];
  return 1;
}

function getCategoryName(categoryId: number): string {
  const names: Record<number, string> = {
    1: "Baby & Parenting",
    5: "Home & Garden",
    6: "Pet Care",
    7: "Health & Wellness",
    8: "Tech & AI Tools",
    17: "Finance and Insurance",
    18: "Travel and Outdoors",
    19: "Start up and Investment",
  };
  return names[categoryId] || "Deals";
}

function buildMetaDescription(caption: string | null): string {
  if (!caption) return "";
  return caption.slice(0, 155).trim();
}

function buildFocusKeyword(hashtags: string | null, title: string): string {
  if (!hashtags) return title.slice(0, 50);
  const first = hashtags.split(",")[0]?.trim().replace(/^#/, "") || title;
  return first.slice(0, 50);
}

async function getOrCreateTags(hashtags: string | null): Promise<number[]> {
  if (!hashtags) return [];
  const tagNames = hashtags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean).slice(0, 5);
  const tagIds: number[] = [];
  for (const name of tagNames) {
    try {
      const searchRes = await fetch(
        `${WP_URL}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=1`,
        { headers: { Authorization: `Basic ${WP_AUTH}` } }
      );
      const existing = await searchRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        tagIds.push(existing[0].id);
      } else {
        const createRes = await fetch(`${WP_URL}/wp-json/wp/v2/tags`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${WP_AUTH}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        });
        const created = await createRes.json();
        if (created.id) tagIds.push(created.id);
      }
    } catch { continue; }
  }
  return tagIds;
}

function buildProductSchema(
  name: string,
  trackingLink: string,
  productImageUrl?: string | null,
  price?: number | null,
  description?: string | null
): string {
  const cleanName = name.replace(/"/g, '\\"').replace(/\n/g, " ");
  const cleanDesc = (description || name).replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 200);
  const priceValidUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "${cleanName}",
  "description": "${cleanDesc}",
  "image": "${productImageUrl || ""}",
  "brand": { "@type": "Brand", "name": "MumDeals" },
  "offers": {
    "@type": "Offer",
    "url": "${trackingLink}",
    "priceCurrency": "GBP",
    "price": "${price || 0}",
    "priceValidUntil": "${priceValidUntil}",
    "availability": "https://schema.org/InStock",
    "seller": { "@type": "Organization", "name": "MumDeals" }
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "89"
  }
}
</script>`;
}

function buildArticleSchema(
  title: string,
  description: string,
  productImageUrl?: string | null
): string {
  const cleanTitle = title.replace(/"/g, '\\"').replace(/\n/g, " ");
  const cleanDesc = description.replace(/"/g, '\\"').replace(/\n/g, " ").slice(0, 200);
  const datePublished = new Date().toISOString();
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${cleanTitle}",
  "description": "${cleanDesc}",
  "image": "${productImageUrl || "https://mumdeals.co.uk/wp-content/uploads/2026/05/mumdeals_logo_v3.svg"}",
  "author": {
    "@type": "Organization",
    "name": "MumDeals",
    "url": "https://mumdeals.co.uk"
  },
  "publisher": {
    "@type": "Organization",
    "name": "MumDeals",
    "logo": {
      "@type": "ImageObject",
      "url": "https://mumdeals.co.uk/wp-content/uploads/2026/05/mumdeals_logo_v3.svg"
    }
  },
  "datePublished": "${datePublished}",
  "dateModified": "${datePublished}",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://mumdeals.co.uk"
  }
}
</script>`;
}

function buildBreadcrumbSchema(
  title: string,
  categoryId: number
): string {
  const categoryName = getCategoryName(categoryId);
  const categorySlug = categoryName.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/--/g, "-");
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://mumdeals.co.uk"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "${categoryName}",
      "item": "https://mumdeals.co.uk/category/${categorySlug}/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "${title.replace(/"/g, '\\"')}",
      "item": "https://mumdeals.co.uk"
    }
  ]
}
</script>`;
}

function extractFaqSchema(scriptText: string): string {
  const match = scriptText.match(/<script type="application\/ld\+json">\s*(\{[\s\S]*?"@type":\s*"FAQPage"[\s\S]*?\})\s*<\/script>/);
  if (match) return `<script type="application/ld+json">${match[1]}</script>`;
  return "";
}

function stripSchemaScripts(scriptText: string): string {
  return scriptText.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "").trim();
}

async function buildPostContent(
  name: string,
  slug: string | null,
  affiliateLink: string | null,
  scriptText: string,
  cta: string,
  productImageUrl?: string | null,
  category?: string | null,
  price?: number | null,
  description?: string | null,
  title?: string | null,
  caption?: string | null,
  categoryId?: number
): Promise<{ content: string; schema: string }> {
  const trackingLink = slug
    ? `https://backend-production-c3f5.up.railway.app/track/go/${slug}`
    : affiliateLink || "#";

  const productImageHtml = productImageUrl ? `
<div style="text-align: center; margin: 16px 0;">
  <img src="${productImageUrl}" alt="${name}" style="max-width: 280px; height: auto; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); border: 1px solid #e5e7eb;" />
</div>` : "";

  const faqSchema = extractFaqSchema(scriptText);
  const cleanContent = stripSchemaScripts(scriptText);

  const productSchema = buildProductSchema(name, trackingLink, productImageUrl, price, description);
  const articleSchema = buildArticleSchema(title || name, caption || description || name, productImageUrl);
  const breadcrumbSchema = buildBreadcrumbSchema(title || name, categoryId || 1);

  const combinedSchema = [productSchema, articleSchema, breadcrumbSchema, faqSchema].filter(Boolean).join("\n");

  const content = `
${cleanContent}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 24px; margin: 24px 0; border-radius: 8px; text-align: center;">
  <h3 style="margin: 0 0 8px; font-size: 20px;">Ready to try ${name}?</h3>
  <p style="margin: 0 0 16px; color: #555;">${cta}</p>
  ${productImageHtml}
  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; margin-top: 16px;">Get ${name} →</a>
</div>

<p style="font-size: 12px; color: #999;"><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
  `.trim();

  return { content, schema: combinedSchema };
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
    const wpCategoryId = getCategoryId(productCategory, content.title);
    const tagIds = await getOrCreateTags(content.hashtags);

    const { content: postContent, schema } = await buildPostContent(
      content.product.name,
      content.product.slug,
      content.product.affiliateLink,
      content.scriptText || "",
      content.cta || "",
      content.product.imageUrl,
      productCategory,
      content.product.price,
      content.product.description,
      content.title,
      content.caption,
      wpCategoryId
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
        tags: tagIds,
        meta: {
          _yoast_wpseo_title: content.title + " | MumDeals",
          _yoast_wpseo_metadesc: buildMetaDescription(content.caption),
          _yoast_wpseo_focuskw: buildFocusKeyword(content.hashtags, content.title || ""),
          _mumdeals_schema: schema,
        },
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

    res.json({ message: "Published!", postUrl: wpPost.link, postId: wpPost.id, category: productCategory, wpCategoryId, tags: tagIds.length });
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
      take: 50,
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
        const wpCategoryId = getCategoryId(productCategory, blog.title);
        const tagIds = await getOrCreateTags(blog.hashtags);

        const { content: postContent, schema } = await buildPostContent(
          blog.product.name,
          blog.product.slug,
          blog.product.affiliateLink,
          blog.scriptText || "",
          blog.cta || "",
          blog.product.imageUrl,
          productCategory,
          blog.product.price,
          blog.product.description,
          blog.title,
          blog.caption,
          wpCategoryId
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
            tags: tagIds,
            meta: {
              _yoast_wpseo_title: blog.title + " | MumDeals",
              _yoast_wpseo_metadesc: buildMetaDescription(blog.caption),
              _yoast_wpseo_focuskw: buildFocusKeyword(blog.hashtags, blog.title || ""),
              _mumdeals_schema: schema,
            },
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