/**
 * Module resolve hook: redirects `three` imports to the test stub.
 */

const STUB_URL = new URL("./three-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "three") {
    return { url: STUB_URL, shortCircuit: true };
  }
  return next(specifier, context);
}
