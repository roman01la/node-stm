const Future = require('fibers/future');
const { ref, transact } = require('./stm-mvcc');

function sleep(ms) {
  const future = new Future();
  setTimeout(() => future.return(), ms);
  return future.wait();
}

function transfer(from, to, amount, delay) {
  return Future.task(() => {
    return transact(() => {
      const fv = from.deref();
      const tv = to.deref();
      sleep(delay);
      from.set(fv - amount);
      to.set(tv + amount);
    });
  });
}

test('should perform multiple `transfer` txs properly', done => {
  const ref1 = ref(1500);
  const ref2 = ref(200);

  expect(ref1.deref()).toEqual(1500);
  expect(ref2.deref()).toEqual(200);

  const tx1 = transfer(ref1, ref2, 1000, 10);
  const tx2 = transfer(ref2, ref1, 100, 0);

  tx1.resolve(() => {
    expect(ref1.deref()).toEqual(600);
    expect(ref2.deref()).toEqual(1100);
    done();
  });
});
