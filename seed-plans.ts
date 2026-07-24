import { db } from "@/lib/db/index";
import { withSystemBypass } from "@/lib/db/system";
import { plan } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  // Update trial plan
  await db.update(plan)
    .set({
      amount: 0,
      currency: 'pln',
      interval: 'month',
      featured: false
    })
    .where(eq(plan.code, 'trial'));

  console.log('Updated trial plan');

  // Check if basic plan exists
  const [basic] = await db.select().from(plan).where(eq(plan.code, 'basic')).limit(1);
  if (!basic) {
    await withSystemBypass("seed: create basic plan", async (tx) => {
      await tx.insert(plan).values({
        code: 'basic',
        name: 'Basic',
        amount: 4900,
        currency: 'pln',
        interval: 'month',
        featured: false,
        isActive: true,
        sortOrder: 1,
      });
    });
    console.log('Created basic plan');
  } else {
    await db.update(plan)
      .set({
        amount: 4900,
        currency: 'pln',
        interval: 'month',
        featured: false
      })
      .where(eq(plan.code, 'basic'));
    console.log('Updated basic plan');
  }

  // Check if pro plan exists
  const [pro] = await db.select().from(plan).where(eq(plan.code, 'pro')).limit(1);
  if (!pro) {
    await withSystemBypass("seed: create pro plan", async (tx) => {
      await tx.insert(plan).values({
        code: 'pro',
        name: 'Pro',
        amount: 9900,
        currency: 'pln',
        interval: 'month',
        featured: true,
        isActive: true,
        sortOrder: 2,
      });
    });
    console.log('Created pro plan');
  } else {
    await db.update(plan)
      .set({
        amount: 9900,
        currency: 'pln',
        interval: 'month',
        featured: true
      })
      .where(eq(plan.code, 'pro'));
    console.log('Updated pro plan');
  }

  // Check if enterprise plan exists
  const [enterprise] = await db.select().from(plan).where(eq(plan.code, 'enterprise')).limit(1);
  if (!enterprise) {
    await withSystemBypass("seed: create enterprise plan", async (tx) => {
      await tx.insert(plan).values({
        code: 'enterprise',
        name: 'Enterprise',
        amount: 19900,
        currency: 'pln',
        interval: 'month',
        featured: false,
        isActive: true,
        sortOrder: 3,
      });
    });
    console.log('Created enterprise plan');
  } else {
    await db.update(plan)
      .set({
        amount: 19900,
        currency: 'pln',
        interval: 'month',
        featured: false
      })
      .where(eq(plan.code, 'enterprise'));
    console.log('Updated enterprise plan');
  }

  console.log('Seeding complete');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });