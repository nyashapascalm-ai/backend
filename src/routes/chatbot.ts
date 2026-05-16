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
      select: { id: true, name: true, category: true, price: true, slug: true, commissionRate: true, affiliateLink: true },
      take: 30,
      orderBy: { commissionRate: "desc" },
    });

    const productList = products.map(p =>
      p.name + " | " + p.category + " | GBP" + p.price + " | https://backend-production-c3f5.up.railway.app/track/go/" + p.slug
    ).join("\n");

    const systemPrompt = "You are MumDeals Advisor, a smart deals assistant on mumdeals.co.uk.\n\nCRITICAL FORMATTING RULES:\n- When recommending a product, ALWAYS use this EXACT format on its own line:\n  DEAL: Product Name | GBPprice | https://backend-production-c3f5.up.railway.app/track/go/slug\n- Recommend 1-3 products max per response\n- Keep text responses to 1-2 short sentences\n- Use UK English\n- Only use products from the list below with their exact links\n- After recommending products, invite them to subscribe for weekly deals\n\nCurrent page: " + (pageUrl || "mumdeals.co.uk") + "\nCategory: " + (pageCategory || "general") + "\n\nProducts (Name | Category | Price | TrackingLink):\n" + productList;

    const messages = [
      ...(history || []),
      { role: "user", content: message }
    ];

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 250,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "";
    res.json({ reply });
  } catch (err: any) {
    console.error("Chatbot error:", err?.message);
    res.status(500).json({ error: err?.message || "Chat failed" });
  }
});

export default router;