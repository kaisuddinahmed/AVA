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
export declare function upsertAddress(data: VisitorAddressData): Promise<{
    id: string;
    siteUrl: string;
    visitorKey: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    lastUsedAt: Date;
}>;
export declare function getAddress(visitorKey: string, siteUrl: string): Promise<{
    id: string;
    siteUrl: string;
    visitorKey: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    lastUsedAt: Date;
} | null>;
export declare function deleteAddress(visitorKey: string, siteUrl: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
export declare function touchAddress(visitorKey: string, siteUrl: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
//# sourceMappingURL=visitor-address.repo.d.ts.map