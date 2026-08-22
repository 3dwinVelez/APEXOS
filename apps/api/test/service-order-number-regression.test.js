const test = require("node:test");
const assert = require("node:assert/strict");
const { nextServiceOrderNumber } = require("../src/modules/services/orderNumber");

test("service order numbering ignores non-canonical stress and imported identifiers", () => {
  assert.equal(nextServiceOrderNumber([
    "OS-00001",
    "NYV-stress-1787148246224-OS-050",
    "OS-imported",
    "SOL-00099"
  ]), "OS-00002");
});

test("service order numbering derives the next value from the highest canonical sequence", () => {
  assert.equal(nextServiceOrderNumber(["OS-00017", "OS-00003", "OS-00042"]), "OS-00043");
  assert.equal(nextServiceOrderNumber([]), "OS-00001");
});
