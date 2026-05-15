import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const WP_URL = process.env.WP_URL || "https://mumdeals.co.uk";
const WP_USER = process.env.WP_USER || "nyashapascalm@gmail.com";
const WP_PASSWORD = process.env.WP_PASSWORD || "oRg4 U5w3 Ie3C u2ej daxP n7kv";
const WP_AUTH = Buffer.from(`${WP_USER}:${WP_PASSWORD}`).toString("base64");
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "DrUS0sg423xsPqZzrJCZ7fXUX4oq6Yc9kGTKVTgszw0";

const CATEGORY_MAP: Record<string, number> = {
  "Baby & Parenting": 1, "baby-parenting": 1, "Parenting": 1, "Baby": 1,
  "Furniture": 1, "Nursery": 1, "Baby Products": 1, "Baby Toys": 1,
  "Baby Clothes": 1, "General Household": 1, "Toys": 1,
  "Home & Garden": 5, "Home Office": 5, "home-garden": 5, "Bedding": 5,
  "Food": 5, "Garden": 5, "Kitchen": 5,
  "Pet Care": 6, "pet-care": 6, "Pets": 6,
  "Health & Wellness": 7, "health-wellness": 7, "Health": 7, "Fitness": 7, "Wellness": 7,
  "Beauty": 7, "Fashion": 7,
  "Tech & AI Tools": 8, "tech-ai-tools": 8, "Tech": 8, "AI Tools": 8,
  "Education": 8, "Business": 8, "Gaming": 8, "Software": 8,
  "Finance and Insurance": 17, "finance-and-insurance": 17, "Finance": 17, "Insurance": 17,
  "Money": 17, "Banking": 17,
  "Start up and Investment": 19, "start-up-and-investment": 19, "Startup": 19,
  "Investment": 19, "Entrepreneur": 19,
  "Travel and Outdoors": 18, "travel-and-outdoors": 18, "Travel": 18, "Outdoors": 18, "Adventure": 18,
};

const CATEGORY_IMAGE_QUERIES: Record<number, string[]> = {
  1: ["baby nursery crib", "baby toys newborn", "mother baby happy", "baby products UK"],
  5: ["home interior living room", "garden flowers lifestyle", "home decor cozy"],
  6: ["dog pet happy", "cat pet lifestyle", "pet products"],
  7: ["health wellness spa", "yoga fitness wellness", "beauty skincare"],
  8: ["technology laptop modern", "smartphone tech gadget", "software coding"],
  17: ["finance money savings", "insurance protection family", "banking investment"],
  18: ["travel adventure nature", "outdoor hiking landscape", "holiday destination"],
  19: ["business startup entrepreneur", "investment growth success", "office team"],
};

function getCategoryId(category: string | null, title?: string | null): number {
  if (title) {
    const t = title.toLowerCase();
    // Baby & Parenting — check first and most broadly
    if (t.includes("baby") || t.includes("nursery") || t.includes("sleeping bag") ||
        t.includes("pram") || t.includes("pushchair") || t.includes("carrier") ||
        t.includes("toddler") || t.includes("newborn") || t.includes("monitor") ||
        t.includes("nappy") || t.includes("infant") || t.includes("crib") ||
        t.includes("cot") || t.includes("teether") || t.includes("rocking") ||
        t.includes("buggy") || t.includes("stroller") || t.includes("breast pump") ||
        t.includes("mamas") || t.includes("papas") || t.includes("babybjorn") ||
        t.includes("ergobaby") || t.includes("cybex") || t.includes("bugaboo") ||
        t.includes("elvie") || t.includes("dockatot") || t.includes("snuzpod") ||
        t.includes("grabbertoy") || t.includes("playmat") || t.includes("highchair") ||
        t.includes("car seat") || t.includes("parasol") || t.includes("muslin")) return 1;
    // Home & Garden
    if (t.includes("bed runner") || t.includes("duvet") || t.includes("curtain") ||
        t.includes("bedding") || t.includes("home office") || t.includes("sofa") ||
        t.includes("preserved flower") || t.includes("garden")) return 5;
    // Pet Care
    if (t.includes("pet") || t.includes("dog") || t.includes("cat") ||
        t.includes("puppy") || t.includes("kitten")) return 6;
    // Health & Wellness
    if (t.includes("health") || t.includes("wellness") || t.includes("fitness") ||
        t.includes("beauty") || t.includes("hair removal") || t.includes("ipl") ||
        t.includes("weight loss") || t.includes("supplement")) return 7;
    // Tech & AI Tools
    if (t.includes("broadband") || t.includes("internet") || t.includes("ai tool") ||
        t.includes("software") || t.includes("tech") || t.includes("jasper") ||
        t.includes("grammarly") || t.includes("canva") || t.includes("zzoomm") ||
        t.includes("fibre")) return 8;
    // Finance & Insurance
    if (t.includes("insurance") || t.includes("finance") || t.includes("cover for") ||
        t.includes("financial") || t.includes("money") || t.includes("banking") ||
        t.includes("loan") || t.includes("mortgage")) return 17;
    // Start up & Investment
    if (t.includes("iso") || t.includes("certification") || t.includes("startup") ||
        t.includes("entrepreneur") || t.includes("investment") || t.includes("business course") ||
        t.includes("isoqar")) return 19;
    // Travel & Outdoors
    if (t.includes("travel") || t.includes("outdoor") || t.includes("holiday") ||
        t.includes("theatre") || t.includes("adventure") || t.includes("hiking") ||
        t.includes("camping")) return 18;
  }
  if (category && CATEGORY_MAP[category]) return CATEGORY_MAP[category];
  return 1;
}

function getCategoryName(categoryId: number): string {
  const names: Record<number, string> = {
    1: "Baby & Parenting", 5: "Home & Garden", 6: "Pet Care",
    7: "Health & Wellness", 8: "Tech & AI Tools", 17: "Finance and Insurance",
    18: "Travel and Outdoors", 19: "Start up and Investment",
  };
  return names[categoryId] || "Deals";
}

function getCategoryImageQuery(categoryId: number, title?: string | null): string {
  const t = (title || "").toLowerCase();
  // Title-based overrides for more specific images
  if (t.includes("pushchair") || t.includes("pram") || t.includes("stroller")) return "baby pushchair pram lifestyle";
  if (t.includes("car seat") || t.includes("isofix")) return "baby car seat safety";
  if (t.includes("breast pump") || t.includes("elvie")) return "breastfeeding mother baby";
  if (t.includes("sleeping bag") || t.includes("dreampod")) return "baby sleeping bag cozy";
  if (t.includes("crib") || t.includes("cot") || t.includes("nursery")) return "baby nursery crib";
  if (t.includes("toy") || t.includes("rocking") || t.includes("playmat")) return "baby toys colorful play";
  if (t.includes("carrier") || t.includes("babybjorn") || t.includes("ergobaby")) return "baby carrier mother";
  if (t.includes("broadband") || t.includes("fibre") || t.includes("zzoomm")) return "home broadband internet";
  if (t.includes("jasper") || t.includes("grammarly") || t.includes("canva")) return "ai tools laptop productivity";
  if (t.includes("travel insurance") || t.includes("cover for")) return "travel adventure passport";
  if (t.includes("iso") || t.includes("isoqar")) return "business certification training";
  if (t.includes("duvet") || t.includes("bedding") || t.includes("curtain")) return "bedroom bedding cozy";
  if (t.includes("bed runner")) return "bedroom interior luxury";
  if (t.includes("preserved flower")) return "flowers bouquet lifestyle";
  if (t.includes("pet") || t.includes("dog") || t.includes("cat")) return "dog pet happy";
  if (t.includes("ipl") || t.includes("hair removal")) return "beauty skincare treatment";
  // Fall back to category queries
  const queries = CATEGORY_IMAGE_QUERIES[categoryId] || ["lifestyle shopping product"];
  return queries[Math.floor(Math.random() * queries.length)];
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
          headers: { Authorization: `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const created = await createRes.json();
        if (created.id) tagIds.push(created.id);
      }
    } catch { continue; }
  }
  return tagIds;
}

async function getProductImage(
  productImageUrl: string | null | undefined,
  name: string,
  categoryId: number,
  title?: string | null
): Promise<string | null> {
  if (productImageUrl) return productImageUrl;
  try {
    const query = getCategoryImageQuery(categoryId, title || name);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=squarish`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    const data = await res.json();
    if (data.results?.length > 0) {
      const random = data.results[Math.floor(Math.random() * Math.min(5, data.results.length))];
      return random.urls.small;
    }
    return null;
  } catch { return null; }
}

async function getRelatedPostLinks(categoryId: number, excludeTitle?: string): Promise<string> {
  try {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=10&status=publish`,
      { headers: { Authorization: `Basic ${WP_AUTH}` } }
    );
    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return "";
    const related = posts.filter((p: any) => p.title?.rendered !== excludeTitle).slice(0, 3);
    if (related.length === 0) return "";
    const links = related.map((p: any) =>
      `<li style="margin-bottom: 8px;"><a href="${p.link}" style="color: #007bff; text-decoration: none; font-size: 15px;">${p.title?.rendered || "Related Post"}</a></li>`
    ).join("");
    return `
<div style="background: #f0f4ff; border-radius: 8px; padding: 20px; margin: 24px 0; border-left: 4px solid #7c3aed;">
  <h3 style="margin: 0 0 12px; font-size: 17px; color: #1a1a2e;">📖 Related Articles You Might Like</h3>
  <ul style="margin: 0; padding-left: 20px;">${links}</ul>
</div>`;
  } catch { return ""; }
}

async function generateFaqHtml(productName: string, title: string, category: string): Promise<{ html: string; schema: string }> {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: `Generate 4 short FAQ questions and answers for a UK affiliate blog post about "${title}" (product: ${productName}, category: ${category}). Keep answers under 40 words each. Return only valid JSON array: [{"question":"Q?","answer":"A."}]`
      }],
    });
    const text = message.content[0].type === "text" ? message.content[0].text : "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const faqs = JSON.parse(clean);
    if (!Array.isArray(faqs) || faqs.length === 0) return { html: "", schema: "" };

    const html = `
<div style="margin-top: 32px; border-top: 2px solid #e5e7eb; padding-top: 24px;">
  <h2 style="font-size: 22px; color: #1a1a2e; margin-bottom: 16px;">❓ Frequently Asked Questions</h2>
  ${faqs.map((f: any) => `
  <div style="margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; background: #f9fafb;">
    <h3 style="margin: 0 0 8px; font-size: 16px; color: #1a1a2e;">${f.question}</h3>
    <p style="margin: 0; color: #555; line-height: 1.6; font-size: 14px;">${f.answer}</p>
  </div>`).join("")}
</div>`;

    const schema = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    ${faqs.map((f: any) => `{
      "@type": "Question",
      "name": "${f.question.replace(/"/g, '\\"')}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${f.answer.replace(/"/g, '\\"')}"
      }
    }`).join(",")}
  ]
}
</script>`;

    return { html, schema };
  } catch { return { html: "", schema: "" }; }
}

function buildProductSchema(name: string, trackingLink: string, productImageUrl?: string | null, price?: number | null, description?: string | null): string {
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
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.5", "reviewCount": "89" }
}
</script>`;
}

function buildArticleSchema(title: string, description: string, productImageUrl?: string | null): string {
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
  "author": { "@type": "Organization", "name": "MumDeals", "url": "https://mumdeals.co.uk" },
  "publisher": {
    "@type": "Organization",
    "name": "MumDeals",
    "logo": { "@type": "ImageObject", "url": "https://mumdeals.co.uk/wp-content/uploads/2026/05/mumdeals_logo_v3.svg" }
  },
  "datePublished": "${datePublished}",
  "dateModified": "${datePublished}",
  "mainEntityOfPage": { "@type": "WebPage", "@id": "https://mumdeals.co.uk" }
}
</script>`;
}

function buildBreadcrumbSchema(title: string, categoryId: number): string {
  const categoryName = getCategoryName(categoryId);
  const categorySlug = categoryName.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "").replace(/--/g, "-");
  return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mumdeals.co.uk" },
    { "@type": "ListItem", "position": 2, "name": "${categoryName}", "item": "https://mumdeals.co.uk/category/${categorySlug}/" },
    { "@type": "ListItem", "position": 3, "name": "${title.replace(/"/g, '\\"')}", "item": "https://mumdeals.co.uk" }
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
  name: string, slug: string | null, affiliateLink: string | null,
  scriptText: string, cta: string, productImageUrl?: string | null,
  category?: string | null, price?: number | null, description?: string | null,
  title?: string | null, caption?: string | null, categoryId?: number
): Promise<{ content: string; schema: string }> {
  const trackingLink = slug
    ? `https://backend-production-c3f5.up.railway.app/track/go/${slug}`
    : affiliateLink || "#";

  const catId = categoryId || 1;
  const buyBoxImageUrl = await getProductImage(productImageUrl, name, catId, title);

  const productImageHtml = buyBoxImageUrl ? `
<div style="text-align: center; margin: 16px 0;">
  <img src="${buyBoxImageUrl}" alt="${name}" style="max-width: 280px; height: auto; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); border: 1px solid #e5e7eb;" title="${title || name}">
</div>` : "";

  // Extract existing FAQ schema from comparison posts, or generate new FAQ for all posts
  const existingFaqSchema = extractFaqSchema(scriptText);
  const cleanContent = stripSchemaScripts(scriptText);
  const relatedLinks = await getRelatedPostLinks(catId, title || name);

  // Generate FAQ for every post
  const faq = existingFaqSchema
    ? { html: "", schema: existingFaqSchema }
    : await generateFaqHtml(name, title || name, category || getCategoryName(catId));

  const productSchema = buildProductSchema(name, trackingLink, buyBoxImageUrl, price, description);
  const articleSchema = buildArticleSchema(title || name, caption || description || name, buyBoxImageUrl);
  const breadcrumbSchema = buildBreadcrumbSchema(title || name, catId);

  const combinedSchema = [productSchema, articleSchema, breadcrumbSchema, faq.schema].filter(Boolean).join("\n");

  const content = `
${cleanContent}

${faq.html}

${relatedLinks}

<div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 24px; margin: 24px 0; border-radius: 8px; text-align: center;">
  <h3 style="margin: 0 0 8px; font-size: 20px;">Ready to try ${name}?</h3>
  <p style="margin: 0 0 16px; color: #555;">${cta}</p>
  ${productImageHtml}
  <p>  <a href="${trackingLink}" style="background: #007bff; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; margin-top: 16px;">Get ${name} →</a>
</div>

<p style="font-size: 12px; color: #999;"><em>Disclosure: This post contains affiliate links. We may earn a commission at no extra cost to you.</em></p>
  `.trim();

  return { content, schema: combinedSchema };
}

async function checkDuplicate(title: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?search=${encodeURIComponent(title)}&per_page=5&status=publish`,
      { headers: { Authorization: `Basic ${WP_AUTH}` } }
    );
    const posts = await res.json();
    if (!Array.isArray(posts)) return false;
    return posts.some((p: any) =>
      p.title?.rendered?.toLowerCase().trim() === title.toLowerCase().trim()
    );
  } catch { return false; }
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

    const isDuplicate = await checkDuplicate(content.title || "");
    if (isDuplicate) {
      await prisma.content.update({ where: { id: contentId }, data: { status: "published" } });
      return res.json({ message: "Skipped - already exists on WordPress", duplicate: true });
    }

    const productCategory = content.product.category || "";
    const wpCategoryId = getCategoryId(productCategory, content.title);
    const tagIds = await getOrCreateTags(content.hashtags);

    const { content: postContent, schema } = await buildPostContent(
      content.product.name, content.product.slug, content.product.affiliateLink,
      content.scriptText || "", content.cta || "", content.product.imageUrl,
      productCategory, content.product.price, content.product.description,
      content.title, content.caption, wpCategoryId
    );

    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { "Authorization": `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
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

    const results = { published: 0, failed: 0, skipped: 0, urls: [] as string[], categories: [] as string[] };

    for (const blog of blogs) {
      try {
        const isDuplicate = await checkDuplicate(blog.title || "");
        if (isDuplicate) {
          await prisma.content.update({ where: { id: blog.id }, data: { status: "published" } });
          results.skipped++;
          continue;
        }

        const productCategory = blog.product.category || "";
        const wpCategoryId = getCategoryId(productCategory, blog.title);
        const tagIds = await getOrCreateTags(blog.hashtags);

        const { content: postContent, schema } = await buildPostContent(
          blog.product.name, blog.product.slug, blog.product.affiliateLink,
          blog.scriptText || "", blog.cta || "", blog.product.imageUrl,
          productCategory, blog.product.price, blog.product.description,
          blog.title, blog.caption, wpCategoryId
        );

        const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
          method: "POST",
          headers: { "Authorization": `Basic ${WP_AUTH}`, "Content-Type": "application/json" },
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
        results.categories.push(`${blog.product.name} → cat ${wpCategoryId}`);
      } catch { results.failed++; }
    }

    res.json({
      message: `Published ${results.published} posts, ${results.skipped} skipped (duplicates), ${results.failed} failed.`,
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
    res.json({ message: `Reset ${result.count} published posts back to draft.`, count: result.count });
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
    const wpRes = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=10&orderby=date&order=desc`, {
      headers: { Authorization: `Basic ${WP_AUTH}` },
    });
    const posts = await wpRes.json();
    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch posts" });
  }
});

export default router;