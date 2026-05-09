import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.product.createMany({
    data: [
      { name: "Laptop", description: "High performance laptop", price: 999.99 },
      { name: "Mouse", description: "Wireless mouse", price: 29.99 },
      { name: "Keyboard", description: "Mechanical keyboard", price: 79.99 },
      { name: "Monitor", description: "27 inch 4K monitor", price: 449.99 },
      { name: "Headphones", description: "Noise cancelling headphones", price: 199.99 },
    ],
  });
  console.log("Database seeded!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
