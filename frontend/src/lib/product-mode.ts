// Product mode switch for the information-platform pivot.
//
// The platform has two intentional surfaces:
//   - information: the default public experience. Facts, tools, and updates lead;
//     commercial routes remain addressable but are not promoted.
//   - commercial: explicit operator mode for future sales campaigns. It does not
//     unlock authorization; auth continues to be handled by session/org roles.
//
// Invalid or missing values intentionally fail closed to "information" so a bad
// deployment variable cannot turn the public site back into a sales-first page.

export type ProductMode = "information" | "commercial";

export const PRODUCT_MODES: readonly ProductMode[] = ["information", "commercial"];

interface ProductModeEnv {
  PATHOS_PRODUCT_MODE?: string | undefined;
}

export function resolveProductMode(env: ProductModeEnv = process.env as ProductModeEnv): ProductMode {
  const requested = env.PATHOS_PRODUCT_MODE?.trim().toLowerCase();
  return requested === "commercial" ? "commercial" : "information";
}

export function isProductMode(mode: ProductMode, expected: ProductMode): boolean {
  return mode === expected;
}

export function isInformationPlatformMode(env: ProductModeEnv = process.env as ProductModeEnv): boolean {
  return resolveProductMode(env) === "information";
}
