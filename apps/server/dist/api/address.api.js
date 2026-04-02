import { VisitorAddressRepo } from "@ava/db";
/**
 * GET /api/address?visitorKey=&siteUrl=
 * Returns the saved address for a visitor (no PII fields).
 */
export async function getAddress(req, res) {
    const { visitorKey, siteUrl } = req.query;
    if (!visitorKey || !siteUrl) {
        res.status(400).json({ error: "visitorKey and siteUrl required" });
        return;
    }
    const addr = await VisitorAddressRepo.getAddress(visitorKey, siteUrl);
    if (!addr) {
        res.json({ address: null });
        return;
    }
    res.json({
        address: {
            addressLine1: addr.addressLine1,
            addressLine2: addr.addressLine2,
            city: addr.city,
            state: addr.state,
            postalCode: addr.postalCode,
            country: addr.country,
            lastUsedAt: addr.lastUsedAt,
        },
    });
}
/**
 * POST /api/address
 * Save or update a visitor's shipping address after explicit confirmation.
 * Only non-PII fields accepted: no name, email, or phone.
 */
export async function saveAddress(req, res) {
    const { visitorKey, siteUrl, addressLine1, addressLine2, city, state, postalCode, country } = req.body;
    if (!visitorKey || !siteUrl || !addressLine1 || !city || !state || !postalCode) {
        res.status(400).json({ error: "visitorKey, siteUrl, addressLine1, city, state, postalCode required" });
        return;
    }
    await VisitorAddressRepo.upsertAddress({
        visitorKey,
        siteUrl,
        addressLine1,
        addressLine2: addressLine2 ?? "",
        city,
        state,
        postalCode,
        country: country ?? "US",
    });
    res.json({ saved: true });
}
/**
 * DELETE /api/address?visitorKey=&siteUrl=
 * Remove saved address — "forget my address" flow.
 */
export async function deleteAddress(req, res) {
    const { visitorKey, siteUrl } = req.query;
    if (!visitorKey || !siteUrl) {
        res.status(400).json({ error: "visitorKey and siteUrl required" });
        return;
    }
    await VisitorAddressRepo.deleteAddress(visitorKey, siteUrl);
    res.json({ deleted: true });
}
//# sourceMappingURL=address.api.js.map