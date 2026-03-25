"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertAddress = upsertAddress;
exports.getAddress = getAddress;
exports.deleteAddress = deleteAddress;
exports.touchAddress = touchAddress;
const client_js_1 = require("../client.js");
async function upsertAddress(data) {
    return client_js_1.prisma.visitorAddress.upsert({
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
async function getAddress(visitorKey, siteUrl) {
    return client_js_1.prisma.visitorAddress.findUnique({
        where: { visitorKey_siteUrl: { visitorKey, siteUrl } },
    });
}
async function deleteAddress(visitorKey, siteUrl) {
    return client_js_1.prisma.visitorAddress.deleteMany({
        where: { visitorKey, siteUrl },
    });
}
async function touchAddress(visitorKey, siteUrl) {
    return client_js_1.prisma.visitorAddress.updateMany({
        where: { visitorKey, siteUrl },
        data: { lastUsedAt: new Date() },
    });
}
//# sourceMappingURL=visitor-address.repo.js.map