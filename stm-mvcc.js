const Fiber = require('fibers');

let ID = 0;

function makeTx() {
  return {
    id: ID, // tx id
    inTxValues: new Map(), // a map from altered ref to its new value
    alteredRefs: new Set() // a set of altered refs
  };
}

function getCurrentTx() {
  if (Fiber.current) {
    return Fiber.current.currentTransaction;
  }
}

function setCurrentTx(tx) {
  if (Fiber.current) {
    Fiber.current.currentTransaction = tx;
  }
}

function txRead(tx, ref) {
  if (tx.inTxValues.has(ref)) {
    // if a ref was altered within current tx — return this value
    return tx.inTxValues.get(ref);
  } else {
    // find ref value that was created <= current tx
    const refEntry = ref._value.find(v => v.id <= tx.id);

    if (!refEntry) {
      throw new Error('No value in `Ref` prior to current transaction');
    } else {
      // otherwise obtain the actual value,
      // associate it with corresponding ref in current tx
      // and return the value
      const inTxValue = refEntry.value;
      tx.inTxValues.set(ref, inTxValue);
      return inTxValue;
    }
  }
}

function txWrite(tx, ref, value) {
  tx.inTxValues.set(ref, value); // associate a new value with corresponding ref in current tx
  tx.alteredRefs.add(ref); // mark a ref as altered
  return value;
}

function txCommit(tx) {
  // perform commit if tehere are any altered refs within current tx
  if (tx.alteredRefs.size !== 0) {
    // if there's a more recent update in ref — abort current tx
    for (let wref of tx.alteredRefs) {
      if (wref.recent().id > tx.id) {
        throw new Error('`Ref` was altered outside of current transaction');
      }
    }

    const id = ID + 1;

    // update all altered refs with a new value
    for (let wref of tx.alteredRefs) {
      const butlast = wref._value.slice(0, wref._value.length - 1);
      wref._value = [{ value: tx.inTxValues.get(wref), id }, ...butlast];
    }

    ID++;
  }
}

function txRun(tx, fn) {
  // set thread local tx
  setCurrentTx(tx);
  let result;

  try {
    const res = { value: fn() }; // obtain tx result
    txCommit(tx); // attempt to commit tx
    result = res;
  } catch (e) {
  } finally {
    // clear thread local tx
    setCurrentTx(undefined);
  }

  if (result) {
    return tx;
  } else {
    // if tx commit failed — retry
    return txRun(makeTx(), fn);
  }
}

function transact(fn) {
  if (getCurrentTx() === undefined) {
    // run tx
    return txRun(makeTx(), fn);
  } else {
    // nested tx
    return fn();
  }
}

class Ref {
  constructor(value) {
    // history of values in a ref
    this._value = [{ id: ID, value }, ...new Array(9)];
  }
  deref() {
    if (getCurrentTx() === undefined) {
      // if there's no ongoing tx — return most recent value of a ref
      return this.recent().value;
    } else {
      // if there's an ongoing tx — perform read operation
      return txRead(getCurrentTx(), this);
    }
  }
  recent() {
    // return most recent value of a ref
    return this._value[0];
  }
  set(value) {
    if (getCurrentTx() === undefined) {
      throw Error("Can't set `Ref` outside transaction");
    } else {
      // if there's an ongoing tx — perform write operation
      return txWrite(getCurrentTx(), this, value);
    }
  }
}

const ref = value => new Ref(value);

module.exports = {
  ref,
  transact
};
