import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = "postgresql://neondb_owner:npg_zTL0CI3vwGXM@ep-cool-salad-aqqrjqlu-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
export default prisma;