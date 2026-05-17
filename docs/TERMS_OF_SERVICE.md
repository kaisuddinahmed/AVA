# AVA — Terms of Service

**Last updated:** 2026-05-17
**Effective for:** AVA — AI Shopping Assistant (the "Service").

> **TODO before App Store submission:** counsel review. The clauses below
> describe the substantive AVA service obligations as actually implemented
> in code today; the legal scaffolding (governing law, jurisdiction,
> arbitration, limitation of liability cap) is placeholder text that
> needs a lawyer's eyes.

---

## 1. Agreement

By installing or using AVA (the "Service"), you (the "Merchant") agree to
these Terms. If you don't agree, do not install the app.

The Service is operated by **TODO — legal entity name** ("we", "us").

## 2. Description of the Service

AVA is an AI-powered shopping assistant that detects friction on your
storefront and runs interventions to recover abandoned carts and improve
conversion. The Service:

- Installs as a Shopify app via OAuth.
- Reads your store's product catalog and visitor behavior in real time.
- Generates recommendations the Merchant must approve before they go live.
- Records intervention outcomes for revenue attribution.
- Sends a weekly digest by email (when configured).

## 3. Plans, pricing, and billing

Plans are listed in the app and persisted in `apps/server/src/billing/billing-plans.ts`:

- **Free** — local-only, no Shopify subscription.
- **Starter** — $29 / 30 days + usage-based fees up to a $100 / 30-day cap.
- **Pro** — $99 / 30 days + usage-based fees up to a $500 / 30-day cap.

Paid plans include a 14-day free trial. Billing is invoiced and collected
by Shopify under the Shopify Billing API. Refunds follow Shopify's
standard merchant refund flow.

When the Merchant uninstalls the app, the Shopify subscription is
automatically cancelled. No partial-period refund is issued by AVA;
Shopify's standard policy applies.

## 4. Acceptable use

The Merchant agrees not to:
- Reverse-engineer, decompile, or attempt to extract the Service's source code.
- Use the Service to harass, deceive, or defraud visitors.
- Run the Service on a store that violates Shopify's Acceptable Use Policy.
- Attempt to bypass rate limits, abuse the billing API, or circumvent
  protected-data restrictions.
- Resell or sublicense the Service without our written permission.

## 5. Data ownership

- **Merchant data** (your store's catalog, configuration, visitor events
  collected on your behalf) remains the Merchant's property. We process
  it on your behalf per the [Privacy Policy](./PRIVACY_POLICY.md).
- **Aggregate, anonymized behavior patterns** contributed via the
  opt-in `networkOptIn` flag become part of AVA's network knowledge
  base. Opt-in is controlled per Merchant.
- AVA retains ownership of its software, models, prompts, friction
  catalog (F001–F325), and behavior pattern catalog (B001–B614).

## 6. Approval gates for actions on your store

The Service NEVER takes a chargeable, customer-facing action without
Merchant approval. Specifically:

- **Recommendations** require explicit "Approve" before launching an
  experiment (Phase 3.2 — `recommendation.service.ts`).
- **Voice interventions** can be muted per session by visitors and
  per session-budget by Merchants (`VOICE_MAX_PER_SESSION`).
- **Tier escalations** (from passive → escalate) are governed by MSWIM
  gates the Merchant can adjust in TRACK → EVALUATE.

## 7. Service availability

We target **99.5% monthly uptime** measured at the public API surface,
excluding scheduled maintenance announced ≥ 24 hours in advance and
outages caused by Shopify, our cloud provider, or upstream LLM
providers (Groq, Deepgram).

Drift alerts and email/PagerDuty notifications are best-effort; missed
notifications do not constitute a breach of these Terms.

## 8. Disclaimers

THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, INCLUDING
IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR
PURPOSE. AI-generated content (voice responses, recommendations) may be
incorrect; the Merchant is responsible for reviewing approval-gated
actions.

## 9. Limitation of liability

To the maximum extent permitted by law, our aggregate liability arising
out of or relating to these Terms is limited to the fees the Merchant
paid AVA in the **trailing twelve months**. We are not liable for
indirect, incidental, consequential, or punitive damages.

> **TODO — counsel may want to tighten the cap (e.g. to trailing 3 or 6
> months) and add explicit carve-outs for IP indemnity / breaches of
> confidentiality.**

## 10. Indemnification

The Merchant agrees to indemnify and hold us harmless from claims arising
from (a) the Merchant's use of the Service in violation of these Terms,
(b) the Merchant's content, or (c) the Merchant's violation of law or
third-party rights.

## 11. Termination

Either party may terminate at any time. On uninstall:

- The Service stops collecting new data immediately.
- The Shopify subscription is automatically cancelled.
- Within ~48 hours, the `shop/redact` GDPR webhook fires and we
  cascade-mark all Merchant data for deletion (see Privacy Policy §7).

We may suspend the Service immediately for material breach (e.g.
non-payment, AUP violation, evidence of abuse).

## 12. Governing law

> **TODO — counsel to set.** Default placeholder: the laws of the State
> of Delaware, USA, without regard to conflict-of-laws principles.

## 13. Changes to these Terms

Material changes will be communicated to Merchants via the merchant
dashboard and email at least **30 days** before they take effect.

## 14. Contact

Legal: **TODO — legal@ava.example**
Support: **TODO — support@ava.example**
