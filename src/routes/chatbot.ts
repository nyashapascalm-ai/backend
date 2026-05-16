import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "../lib/prisma.js";

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post("/chat", async (req, res) => {
  try {
    const { message, history, pageUrl, pageCategory } = req.body;

    const products = await prisma.product.findMany({
      where: { status: "active" },
      select: { id: true, name: true, category: true, price: true, slug: true, description: true, commissionRate: true },
      take: 50,
    });

    const productList = products.map(p =>
      `- ${p.name} (${p.category}) £${p.price} | link: https://backend-production-c3f5.up.railway.app/track/go/${p.slug}`
    ).join("\n");

    const systemPrompt = `You are MumDeals Assistant, a smart deals advisor on mumdeals.co.uk - a UK deals and affiliate site.

Your job is to:
1. Understand what the visitor needs (baby products, home, tech, health, travel, finance etc)
2. Recommend specific products from our catalogue with their tracking links
3. After showing 2-3 products, invite them to subscribe to weekly deals
4. Be concise, helpful and direct. Max 3 sentences per response.
5. Always include product links when recommending products
6. Use UK English

Current page: ${pageUrl || "mumdeals.co.uk"}
Page category: ${pageCategory || "general"}

Available products:
${productList}

Rules:
- Only recommend products from the list above
- Always use the exact tracking links provided
- Format product recommendations as: **Product Name** - £price [View Deal](link)
- If asked about something not in catalogue, suggest subscribing for more deals
- Keep responses short and actionable`;

    const messages = [
      ...(history || []),
      { role: "user", content: message }
    ];

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";

    res.json({ reply, usage: response.usage });
  } catch (err: any) {
    console.error("Chatbot error:", err?.message);
    res.status(500).json({ error: err?.message || "Chat failed" });
  }
});

export default router;