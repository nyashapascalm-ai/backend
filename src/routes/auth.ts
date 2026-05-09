import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD_HASH = bcrypt.hashSync("admin123", 10);
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const valid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token });
});

export default router;