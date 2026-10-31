// Demo data for Brightloop Software. Safe to re-run: every record is upserted.
// All demo accounts use the password Demo@12345.
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Demo@12345", 10);

  await db.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Brightloop Software",
      email: "billing@brightloop.test",
      phone: "+91 80 4000 1234",
      address: "4th Floor, Loop Tower, MG Road, Bengaluru 560001",
      gstNumber: "29ABCDE1234F1Z5",
      currency: "INR",
    },
  });

  const users: { name: string; email: string; role: Role; company?: string }[] = [
    { name: "Asha Admin", email: "admin@brightloop.test", role: "ADMIN" },
    { name: "Sam Staff", email: "staff@brightloop.test", role: "STAFF" },
    { name: "Kiran Customer", email: "customer@brightloop.test", role: "CUSTOMER", company: "Kiran Stores" },
  ];
  for (const user of users) {
    await db.user.upsert({ where: { email: user.email }, update: {}, create: { ...user, passwordHash } });
  }

  for (const tax of [
    { name: "GST 18%", rate: 18 },
    { name: "GST 5%", rate: 5 },
  ]) {
    const exists = await db.tax.findFirst({ where: { name: tax.name } });
    if (!exists) await db.tax.create({ data: tax });
  }

  console.log("Seeded Brightloop demo data. Log in as admin@brightloop.test / Demo@12345");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
