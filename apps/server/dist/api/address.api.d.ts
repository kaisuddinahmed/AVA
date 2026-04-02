import { Request, Response } from "express";
/**
 * GET /api/address?visitorKey=&siteUrl=
 * Returns the saved address for a visitor (no PII fields).
 */
export declare function getAddress(req: Request, res: Response): Promise<void>;
/**
 * POST /api/address
 * Save or update a visitor's shipping address after explicit confirmation.
 * Only non-PII fields accepted: no name, email, or phone.
 */
export declare function saveAddress(req: Request, res: Response): Promise<void>;
/**
 * DELETE /api/address?visitorKey=&siteUrl=
 * Remove saved address — "forget my address" flow.
 */
export declare function deleteAddress(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=address.api.d.ts.map