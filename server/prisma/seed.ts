import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.callEvent.deleteMany()
  await prisma.staffTask.deleteMany()
  await prisma.callJob.deleteMany()
  await prisma.inboundCall.deleteMany()

  console.log('Database cleared — ready for real data')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
