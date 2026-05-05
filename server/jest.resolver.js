/**
 * Custom Jest resolver that tells Node's package-exports resolution to
 * use the "require" condition instead of "import".
 *
 * drizzle-orm ships as dual CJS/ESM. Jest runs in a CJS environment but
 * defaults to the "import" exports condition, which picks the ESM .js files
 * that contain "export *" syntax and crash Jest's module loader.
 *
 * By passing `conditions: ['require', 'node', 'default']` we get the .cjs files.
 */
module.exports = (request, options) => {
  return options.defaultResolver(request, {
    ...options,
    conditions: ['require', 'node', 'node-addons', 'default'],
  });
};
