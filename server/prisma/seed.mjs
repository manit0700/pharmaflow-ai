import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

await prisma.callEvent.deleteMany()
await prisma.staffTask.deleteMany()
await prisma.callJob.deleteMany()
await prisma.inboundCall.deleteMany()

console.log('Database cleared — ready for real data')
await prisma.$disconnect()
