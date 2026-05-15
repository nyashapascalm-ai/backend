import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const PINTEREST_TOKEN = process.env.PINTEREST_TOKEN || "";
let BOARD_ID = process.env.PINTEREST_BOARD_ID || "";

async function getBoardId(): Promise<string> {
  if (BOARD_ID && !BOARD_ID.includes("/")) return BOARD_ID;
  try {
    const res = await fetch(`https://api.pinterest.com/v5/boards?page_size=25`, {
      headers: { Authorization: `Bearer ${PINTEREST_TOKEN}` },
    });
    const data = await res.json();
    if (data.items?.length > 0) {
      const board = data.items.find((b: any) =>
        b.name?.toLowerCase().includes("baby") ||
        b.name?.toLowerCase().includes("deals") ||
        b.name?.toLowerCase().includes("mum")
      ) || data.items[0];
      BOARD_ID = board.id;
      return board.id;
    }
    throw new Error("No boards found");
  } catch (err: any) {
    throw new Error(`Failed to get board ID: ${err.message}`);
  }
}

async function createPin(title: string, description: string, link: string, imageUrl?: string) {
  const boardId = await getBoardId();
  const body: any = {
    board_id: boardId,
    title: title.slice(0, 100),
    description: description.slice(0, 500),
    link,
    media_source: imageUrl
      ? { source_type: "image_url", url: imageUrl }
      : { source_type: "image_url", url: "https://via.placeholder.com/600x900/FF6B6B/FFFFFF?text=MumDeals" },
  };

  const res = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINTEREST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || JSON.stringify(err));
  }

  return await res.json();
}

router.post("/pin/:productId", requireAuth, async (req, res) => {
  const productId = parseInt(req.params.productId);
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        content: {
          where: { type: "blog" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const trackingLink = product.slug
      ? `https://backend-production-c3f5.up.railway.app/track/go/${product.slug}`
      : product.affiliateLink || "https://mumdeals.co.uk";

    const caption = product.content[0]?.caption || `Check out ${product.name} — great deal!`;
    const hashtags = product.content[0]?.hashtags || "#mumdeals #ukdeals #parenting";
    const description = `${caption}\n\n${hashtags}`;
    const imageUrl = product.imageUrl || undefined;

    const pin = await createPin(product.name, description, trackingLink, imageUrl);

    res.json({
      message: "Pin created!",
      pinId: pin.id,
      pinUrl: `https://pinterest.com/pin/${pin.id}`,
    });
  } catch (err: any) {
    console.error("Pinterest error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to create pin" });
  }
});

router.post("/pin-all-products", requireAuth, async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { status: "active" },
      include: {
        content: {
          where: { type: "blog" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 50,
    });

    const results = { created: 0, failed: 0, pins: [] as string[] };

    for (const product of products) {
      try {
        const trackingLink = product.slug
          ? `https://backend-production-c3f5.up.railway.app/track/go/${product.slug}`
          : product.affiliateLink || "https://mumdeals.co.uk";

        const caption = product.content[0]?.caption || `Check out ${product.name}!`;
        const hashtags = product.content[0]?.hashtags || "#mumdeals #ukdeals #parenting";
        const description = `${caption}\n\n${hashtags}`;
        const imageUrl = product.imageUrl || undefined;

        const pin = await createPin(product.name, description, trackingLink, imageUrl);

        results.created++;
        results.pins.push(`https://pinterest.com/pin/${pin.id}`);

        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        console.error(`Pin failed for ${product.name}:`, err?.message);
        results.failed++;
      }
    }

    res.json({
      message: `Created ${results.created} pins, ${results.failed} failed.`,
      ...results,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to pin all products" });
  }
});

router.get("/board", requireAuth, async (req, res) => {
  try {
    const boardRes = await fetch(`https://api.pinterest.com/v5/boards?page_size=25`, {
      headers: { Authorization: `Bearer ${PINTEREST_TOKEN}` },
    });
    const data = await boardRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch boards" });
  }
});

router.get("/user", requireAuth, async (req, res) => {
  try {
    const userRes = await fetch(`https://api.pinterest.com/v5/user_account`, {
      headers: { Authorization: `Bearer ${PINTEREST_TOKEN}` },
    });
    const data = await userRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch user" });
  }
});

export default router;