const test = require('node:test');
const assert = require('node:assert/strict');
const { conversionLines } = require('../src/modules/commercial-management/quotation-conversion');
test('conserva cotizacion, admite mas, menos, cero y nuevos productos', () => {
  const original = [{ product_id: 1, quantity: 10, discount: 20 }, { product_id: 2, quantity: 5, discount: 0 }];
  const snapshot = JSON.stringify(original);
  assert.deepEqual(conversionLines(original, [{ product_id: 1, quantity: 4 }, { product_id: 2, quantity: 0 }, { product_id: 3, quantity: 7 }]), [{ product_id: 1, quantity: 4, discount: 8 }, { product_id: 3, quantity: 7, discount: 0 }]);
  assert.equal(conversionLines(original, [{ product_id: 1, quantity: 12 }, { product_id: 2, quantity: 5 }])[0].quantity, 12);
  assert.equal(JSON.stringify(original), snapshot);
  assert.throws(() => conversionLines(original, [{ product_id: 1, quantity: 1 }]), { statusCode: 400 });
  assert.throws(() => conversionLines(original, [{ product_id: 1, quantity: -1 }, { product_id: 2, quantity: 0 }]), { statusCode: 400 });
  assert.throws(() => conversionLines(original, [{ product_id: 1, quantity: 0 }, { product_id: 2, quantity: 0 }]), { statusCode: 400 });
  assert.throws(() => conversionLines(original, [{ product_id: 1, quantity: 1 }, { product_id: 1, quantity: 1 }]), { statusCode: 400 });
});
