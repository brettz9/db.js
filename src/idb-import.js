self._babelPolyfill = false; // Need by Phantom in avoiding duplicate babel polyfill error
import IdbSchema from 'idb-schema';

const hasOwn = Object.prototype.hasOwnProperty;

export default class IdbImport extends IdbSchema {
    constructor () {
        super();
    }
    createSchema (schema, version, clearUnusedStores) {
        if (!schema || typeof schema !== 'object') {
            throw new Error('Bad schema object');
        }
        this.version(version);

        this.addEarlyCallback((e) => {
            const db = e.target.result;
            const transaction = e.target.transaction;

            if (clearUnusedStores) {
                Array.from(db.objectStoreNames).forEach((name) => {
                    if (!hasOwn.call(schema, name)) {
                        // Errors for which we are not concerned and why:
                        // `InvalidStateError` - We are in the upgrade transaction.
                        // `TransactionInactiveError` (as by the upgrade having already
                        //      completed or somehow aborting) - since we've just started and
                        //      should be without risk in this loop
                        // `NotFoundError` - since we are iterating the dynamically updated
                        //      `objectStoreNames`
                        this._versions[version].dropStores.push({name: name});
                        // this.delStore(name); // Shouldn't throw // Uncomment this and delete previous line if this PR is accepted: https://github.com/treojs/idb-schema/pull/14
                    }
                });
            }

            Object.keys(schema).some((tableName) => {
                const table = schema[tableName];
                let store;
                if (db.objectStoreNames.contains(tableName)) {
                    store = transaction.objectStore(tableName); // Shouldn't throw
                    this.getStore(store);
                } else {
                    // Errors for which we are not concerned and why:
                    // `InvalidStateError` - We are in the upgrade transaction.
                    // `ConstraintError` - We are just starting (and probably never too large anyways) for a key generator.
                    // `ConstraintError` - The above condition should prevent the name already existing.
                    //
                    // Possible errors:
                    // `TransactionInactiveError` - if the upgrade had already aborted,
                    //      e.g., from a previous `QuotaExceededError` which is supposed to nevertheless return
                    //      the store but then abort the transaction.
                    // `SyntaxError` - if an invalid `table.key.keyPath` is supplied.
                    // `InvalidAccessError` - if `table.key.autoIncrement` is `true` and `table.key.keyPath` is an
                    //      empty string or any sequence (empty or otherwise).
                    this.addStore(tableName, table.key); // May throw
                }

                Object.keys(table.indexes || {}).some((indexKey) => {
                    try {
                        store.index(indexKey);
                    } catch (err) {
                        let index = table.indexes[indexKey];
                        index = index && typeof index === 'object' ? index : {};
                        // Errors for which we are not concerned and why:
                        // `InvalidStateError` - We are in the upgrade transaction and store found above should not have already been deleted.
                        // `ConstraintError` - We have already tried getting the index, so it shouldn't already exist
                        //
                        // Possible errors:
                        // `TransactionInactiveError` - if the upgrade had already aborted,
                        //      e.g., from a previous `QuotaExceededError` which is supposed to nevertheless return
                        //      the index object but then abort the transaction.
                        // `SyntaxError` - If the `keyPath` (second argument) is an invalid key path
                        // `InvalidAccessError` - If `multiEntry` on `index` is `true` and
                        //                          `keyPath` (second argument) is a sequence
                        this.addIndex(indexKey, index.keyPath || index.key || indexKey, index);
                    }
                });
            });
        });
    }
}
