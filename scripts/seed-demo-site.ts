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

  // Active statuses — do not downgrade if already fully activated
  const ACTIVE_STATUSES = ["active", "limited_active"];

  if (existing) {
    const needsKeyFix = existing.siteKey !== DEMO_SITE_KEY;
    // Upgrade dormant/in-progress statuses to limited_active so the demo works
    // without requiring the wizard to be re-run every time.
    const needsStatusUpgrade = !ACTIVE_STATUSES.includes(existing.integrationStatus);

    if (!needsKeyFix && !needsStatusUpgrade) {
      console.log(`Demo site already seeded with correct siteKey (${DEMO_SITE_KEY})`);
      console.log(`  integrationStatus: ${existing.integrationStatus}`);
      console.log("\n⏭  Skipping seed (already correct).");
      return;
    }

    await prisma.siteConfig.update({
      where: { siteUrl: DEMO_SITE_URL },
      data: {
        ...(needsKeyFix ? { siteKey: DEMO_SITE_KEY } : {}),
        ...(needsStatusUpgrade ? { integrationStatus: "limited_active" } : {}),
      },
    });
    if (needsKeyFix) console.log(`✅ Updated demo site siteKey to ${DEMO_SITE_KEY} (was ${existing.siteKey})`);
    if (needsStatusUpgrade) console.log(`✅ Upgraded integrationStatus: ${existing.integrationStatus} → limited_active`);
    return;
  }

  // Create the demo site config from scratch — pre-activate so the demo works
  // immediately without requiring a full wizard run.
  const site = await prisma.siteConfig.create({
    data: {
      siteUrl: DEMO_SITE_URL,
      siteKey: DEMO_SITE_KEY,
      platform: "custom",
      trackingConfig: JSON.stringify({}),
      integrationStatus: "limited_active",
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
