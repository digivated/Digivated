// One public offer. Enable checkout only after the Gumroad listing matches it.
export const membership = Object.freeze({
  name: 'Digivated Pro',
  priceUSD: 5,
  billing: 'one-time',
  checkoutReady: false,
  checkoutUrl: 'https://digivated.gumroad.com/l/founding-member-pass',
  gumroadProductId: 'ECtpJt5BlrNuDT2z1Ka8Jg==',
  // News is free for everyone and is not a membership benefit.
  newsAccess: 'free',
  // Unlimited project uploads that publish instantly (see src/lib/plans.mjs).
  projectLimit: 0,
});
