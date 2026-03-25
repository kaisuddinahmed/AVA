#!/usr/bin/env tsx
// ============================================================================
// Seed Script: Demo Store Site Config
// Ensures the demo store (localhost:3001) always has the exact siteKey that
// is hardcoded in apps/store/index.html. Without this, a fresh DB generates
// a random siteKey that doesn't match the store snippet, causing the widget
// activation gate to return `key_mismatch` → widget stays dormant → no events
// in the Live Event Feed.
// ============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Must match the siteKey hardcoded in apps/store/index.html __AVA_CONFIG__
const DEMO_SITE_URL = "http://localhost:3001";
const DEMO_SITE_KEY = "avak_eff0c37fabe8d527";

async function main() {
  console.log("═══ AVA Demo Site Seed ═══\n");

  const existing = await prisma.siteConfig.findUnique({
    where: { siteUrl: DEMO_SITE_URL },
  });

  if (existing) {
    if (existing.siteKey === DEMO_SITE_KEY) {
      console.log(`Demo site already seeded with correct siteKey (${DEMO_SITE_KEY})`);
      console.log(`  integrationStatus: ${existing.integrationStatus}`);
      console.log("\n⏭  Skipping seed (already correct).");
      return;
    }
    // Key mismatch — update to the canonical demo key so the store snippet works.
    // Never touch integrationStatus — that is owned by the wizard flow.
    await prisma.siteConfig.update({
      where: { siteUrl: DEMO_SITE_URL },
      data: { siteKey: DEMO_SITE_KEY },
    });
    console.log(`✅ Updated demo site siteKey to ${DEMO_SITE_KEY} (was ${existing.siteKey})`);
    return;
  }

  // Create the demo site config from scratch.
  // Status starts as "pending" — the wizard owns the transition to active.
  const site = await prisma.siteConfig.create({
    data: {
      siteUrl: DEMO_SITE_URL,
      siteKey: DEMO_SITE_KEY,
      platform: "custom",
      trackingConfig: JSON.stringify({}),
      integrationStatus: "pending",
    },
  });

  console.log(`✅ Created demo site config`);
  console.log(`  siteUrl:  ${site.siteUrl}`);
  console.log(`  siteKey:  ${site.siteKey}`);
  console.log(`  status:   ${site.integrationStatus}`);
  console.log("\n✅ Demo site seed complete.");
}

main()
  .catch((error) => {
    console.error("❌ Demo site seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
