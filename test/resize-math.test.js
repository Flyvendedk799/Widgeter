const assert = require('assert');
const { clampSize, decideSmartSize, splitEven, migrateDisplay } = require('../engine/resize-math');

assert.deepStrictEqual(clampSize(50, 10, { minWidth: 160, maxWidth: 800, minHeight: 80, maxHeight: 900 }), {
  width: 160,
  height: 80
});

assert.deepStrictEqual(clampSize(2000, 2000, { minWidth: 160, maxWidth: 640, minHeight: 80, maxHeight: 400 }), {
  width: 640,
  height: 400
});

assert.deepStrictEqual(clampSize(300, 300, { minWidth: 400, maxWidth: 200, minHeight: 100, maxHeight: 50 }), {
  width: 400,
  height: 100
});

assert.deepStrictEqual(decideSmartSize({ width: 380, height: 600 }, { width: 384, height: 220 }), {
  width: 380,
  height: 220
});

assert.deepStrictEqual(decideSmartSize({ width: 380, height: 200 }, { width: 720, height: 240 }), {
  width: 720,
  height: 240
});

assert.deepStrictEqual(splitEven(3, 100), [34, 33, 33]);
assert.strictEqual(splitEven(4, 100).reduce((a, b) => a + b, 0), 100);
assert.deepStrictEqual(splitEven(0, 100), []);
assert.deepStrictEqual(splitEven(1, 100), [100]);

const migrated = migrateDisplay({
  autoResize: false,
  config: { _autoResize: true, _opacity: 0.4, maxHeight: 500, ssh_key: 'keep' }
});
assert.strictEqual(migrated.autoResize, true);
assert.strictEqual(migrated.opacity, 0.4);
assert.strictEqual(migrated.maxHeight, 500);
assert.strictEqual(migrated.config.ssh_key, 'keep');
assert.strictEqual(migrated.config._autoResize, undefined);
assert.strictEqual(migrated._displayMigrated, true);

migrated.autoResize = false;
migrated.config._autoResize = true;
migrateDisplay(migrated);
assert.strictEqual(migrated.autoResize, false);

const fresh = migrateDisplay({ config: {} });
assert.strictEqual(fresh.autoResize, false);
assert.strictEqual(fresh.opacity, 1);
assert.strictEqual(fresh.minWidth, 160);
assert.strictEqual(fresh.maxWidth, 800);

console.log('resize-math tests passed');
