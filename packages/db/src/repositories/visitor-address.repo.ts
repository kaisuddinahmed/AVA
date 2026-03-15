import { prisma } from "../client.js";

// ---------------------------------------------------------------------------
// VisitorAddress Repository — server-persisted shipping address for autofill
// ---------------------------------------------------------------------------

export interface VisitorAddressData {
  visitorKey: string;
  siteUrl: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
}

export async function upsertAddress(data: VisitorAddressData) {
  return prisma.visitorAddress.upsert({
    where: { visitorKey_siteUrl: { visitorKey: data.visitorKey, siteUrl: data.siteUrl } },
    create: {
      ...data,
      addressLine2: data.addressLine2 ?? "",
      country: data.country ?? "US",
      lastUsedAt: new Date(),
    },
    update: {
      addressLine1: data.addressLine1,
      addressLine2: data.addressLine2 ?? "",
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      country: data.country ?? "US",
      lastUsedAt: new Date(),
    },
  });
}

export async function getAddress(visitorKey: string, siteUrl: string) {
  return prisma.visitorAddress.findUnique({
    where: { visitorKey_siteUrl: { visitorKey, siteUrl } },
  });
}

export async function deleteAddress(visitorKey: string, siteUrl: string) {
  return prisma.visitorAddress.deleteMany({
    where: { visitorKey, siteUrl },
  });
}

export async function touchAddress(visitorKey: string, siteUrl: string) {
  return prisma.visitorAddress.updateMany({
    where: { visitorKey, siteUrl },
    data: { lastUsedAt: new Date() },
  });
}
