# Digivated single-offer remap

The owner selected **$5 USD once**, not recurring billing. Benefits: one reviewed project spotlight and full News access when News launches. News is not built yet; no launch date is promised.

The site is staged with checkout disabled until the seller listing matches. Existing packet, founding membership and promotional purchases retain their original access and included benefits. The existing one-time product ID and permalink are retained so purchase verification does not break.

## Prepared assets

- `membership-product.json`: product title, description, price and receipt copy.
- `storefront.html`: lightweight black/purple Gumroad profile page.
- `/membership-cover.png` and `/membership-thumbnail.png`: matching brand images, served by Digivated.

## Applying the seller changes

1. Deploy the site and images first. Set `GUMROAD_ACCESS_TOKEN` through secure environment settings, with product-edit and profile-edit access. Never paste tokens in chat or commit them.
2. Run `node scripts/remap-gumroad-membership.mjs` for a read-only account/product check.
3. Run `node scripts/remap-gumroad-membership.mjs --apply` to update the existing membership's metadata and images, publish the matching storefront, and unpublish only the three old standalone products named in the script. It does not delete products, buyer files, sales, or licenses. A private backup is written to `/tmp`.
4. Verify the public listing and checkout show $5 USD once, the two benefits, and News coming soon. Set `checkoutReady: true` in `src/data/membership.mjs`, rebuild, and deploy.

A failed or incomplete remap must leave checkout disabled. Gumroad checkout itself remains Gumroad-managed. The custom profile and cover assets carry Digivated's theme.

## Access and future News

Existing server-only Gumroad verification, product ID, encrypted cookies, refund/chargeback checks and atomic one-feature claim are preserved. Internal `founding-*` names remain compatible with existing licenses; they are not a second public offer. The new News section must use server-side verified membership (`readMember`) before returning paid content; no new News content or entitlement is served by this staging change.

The seller-edit token is an operator credential for this one-time remap. It is not used by the deployed site and should not replace the site's read-only purchase-verification credential.
