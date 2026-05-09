const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({}); // empty object only

async function main() {
  const products = await prisma.product.findMany();
  console.log(products);
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
