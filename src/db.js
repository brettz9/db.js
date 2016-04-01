import IdbSchema from 'idb-schema';
import SyncPromise from 'sync-promise';

(function (local, Promise) {
    'use strict';

    const hasOwn = Object.prototype.hasOwnProperty;

    // SyncPromise utils
    function runAsync (cb) {
        setTimeout(function () {
            cb();
        }, 0);
    }
    Promise.resolve = function (val) {
        return new Promise(function (resolve, reject) {
            runAsync(function () {
                resolve(val);
            });
        });
    };
    Promise.reject = function (val) {
        return new Promise(function (resolve, reject) {
            runAsync(function () {
                reject(val);
            });
        });
    };
    function trySync (trying, reject, resolve) {
        try {
            let result = trying();
            if (resolve) {
                runAsync(function () {
                    resolve(result);
                });
            }
            return true;
        } catch (err) {
            runAsync(function () {
                reject(err);
            });
            return false;
        }
    }

    const indexedDB = local.indexedDB || local.webkitIndexedDB ||
        local.mozIndexedDB || local.oIndexedDB || local.msIndexedDB ||
        local.shimIndexedDB || (function () {
            throw new Error('IndexedDB required');
        }());
    const IDBKeyRange = local.IDBKeyRange || local.webkitIDBKeyRange;

    const defaultMapper = x => x;
    const serverEvents = ['abort', 'error', 'versionchange'];
    const transactionModes = {
        readonly: 'readonly',
        readwrite: 'readwrite'
    };

    const dbCache = {};

    function isObject (item) {
        return item && typeof item === 'object';
    }

    function mongoDBToKeyRangeArgs (opts) {
        const keys = Object.keys(opts).sort();
        if (keys.length === 1) {
            const key = keys[0];
            const val = opts[key];
            let name, inclusive;
            switch (key) {
            case 'eq': name = 'only'; break;
            case 'gt':
                name = 'lowerBound';
                inclusive = true;
                break;
            case 'lt':
                name = 'upperBound';
                inclusive = true;
                break;
            case 'gte': name = 'lowerBound'; break;
            case 'lte': name = 'upperBound'; break;
            default: throw new TypeError('`' + key + '` is not a valid key');
            }
            return [name, [val, inclusive]];
        }
        const x = opts[keys[0]];
        const y = opts[keys[1]];
        const pattern = keys.join('-');

        switch (pattern) {
        case 'gt-lt': case 'gt-lte': case 'gte-lt': case 'gte-lte':
            return ['bound', [x, y, keys[0] === 'gt', keys[1] === 'lt']];
        default: throw new TypeError(
          '`' + pattern + '` are conflicted keys'
        );
        }
    }
    function mongoifyKey (key) {
        if (key && typeof key === 'object' && !(key instanceof IDBKeyRange)) {
            const [type, args] = mongoDBToKeyRangeArgs(key);
            return IDBKeyRange[type](...args);
        }
        return key;
    }

    const IndexQuery = function (table, db, indexName, preexistingError, upgradeTransaction) {
        let modifyObj = null;

        const runQuery = function (type, args, cursorType, direction, limitRange, filters, mapper) {
            return new Promise(function (resolve, reject) {
                let keyRange;
                if (!trySync(function () {
                    keyRange = type ? IDBKeyRange[type](...args) : null;
                }, reject)) {
                    return;
                }

                filters = filters || [];
                limitRange = limitRange || null;

                let results = [];
                let counter = 0;
                const indexArgs = [keyRange];

                const transaction = upgradeTransaction || db.transaction(table, modifyObj ? transactionModes.readwrite : transactionModes.readonly);
                transaction.onerror = e => reject(e);
                transaction.onabort = e => reject(e);
                transaction.oncomplete = () => resolve(results);

                const store = transaction.objectStore(table); // if bad, db.transaction will reject first
                const index = typeof indexName === 'string' ? store.index(indexName) : store;

                if (cursorType !== 'count') {
                    indexArgs.push(direction || 'next');
                }

                // Create a function that will set in the modifyObj properties into
                // the passed record.
                const modifyKeys = modifyObj ? Object.keys(modifyObj) : [];

                const modifyRecord = function (record) {
                    modifyKeys.forEach(key => {
                        let val = modifyObj[key];
                        if (typeof val === 'function') { val = val(record); }
                        record[key] = val;
                    });
                    return record;
                };

                index[cursorType](...indexArgs).onsuccess = function (e) { // indexArgs are already validated
                    const cursor = e.target.result;
                    if (typeof cursor === 'number') {
                        results = cursor;
                    } else if (cursor) {
                        if (limitRange !== null && limitRange[0] > counter) {
                            counter = limitRange[0];
                            cursor.advance(limitRange[0]); // Will throw on 0, but condition above prevents since counter always 0+
                        } else if (limitRange !== null && counter >= (limitRange[0] + limitRange[1])) {
                            // Out of limit range... skip
                        } else {
                            let matchFilter = true;
                            let result = 'value' in cursor ? cursor.value : cursor.key;

                            if (!trySync(function () {
                                filters.forEach(function (filter) {
                                    if (!filter || !filter.length) {
                                        // Invalid filter do nothing
                                    } else if (filter.length === 2) {
                                        matchFilter = matchFilter && (result[filter[0]] === filter[1]);
                                    } else {
                                        matchFilter = matchFilter && filter[0](result);
                                    }
                                });
                            }, reject)) {
                                return;
                            }

                            if (matchFilter) {
                                counter++;
                                // If we're doing a modify, run it now
                                if (modifyObj) {
                                    if (!trySync(function () {
                                        result = modifyRecord(result);
                                        cursor.update(result); // `result` should only be a "structured clone"-able object
                                    }, reject)) {
                                        return;
                                    }
                                }
                                if (!trySync(function () {
                                    results.push(mapper(result));
                                }, reject)) {
                                    return;
                                }
                            }
                            cursor.continue();
                        }
                    }
                };
            });
        };

        const Query = function (type, args, queuedError) {
            const filters = [];
            let direction = 'next';
            let cursorType = 'openCursor';
            let limitRange = null;
            let mapper = defaultMapper;
            let unique = false;
            let error = preexistingError || queuedError;

            const execute = function () {
                if (error) {
                    return Promise.reject(error);
                }
                return runQuery(type, args, cursorType, unique ? direction + 'unique' : direction, limitRange, filters, mapper);
            };

            const count = function () {
                direction = null;
                cursorType = 'count';

                return {
                    execute
                };
            };

            const keys = function () {
                cursorType = 'openKeyCursor';

                return {
                    desc,
                    distinct,
                    execute,
                    filter,
                    limit,
                    map
                };
            };

            const limit = function (...args) {
                limitRange = args.slice(0, 2);
                error = limitRange.some(val => typeof val !== 'number') ? new Error('limit() arguments must be numeric') : error;
                if (limitRange.length === 1) {
                    limitRange.unshift(0);
                }

                return {
                    desc,
                    distinct,
                    filter,
                    keys,
                    execute,
                    map,
                    modify
                };
            };

            const filter = function (...args) {
                filters.push(args.slice(0, 2));

                return {
                    desc,
                    distinct,
                    execute,
                    filter,
                    keys,
                    limit,
                    map,
                    modify
                };
            };

            const desc = function () {
                direction = 'prev';

                return {
                    distinct,
                    execute,
                    filter,
                    keys,
                    limit,
                    map,
                    modify
                };
            };

            const distinct = function () {
                unique = true;
                return {
                    count,
                    desc,
                    execute,
                    filter,
                    keys,
                    limit,
                    map,
                    modify
                };
            };

            const modify = function (update) {
                modifyObj = update && typeof update === 'object' ? update : null;
                return {
                    execute
                };
            };

            const map = function (fn) {
                mapper = fn;

                return {
                    count,
                    desc,
                    distinct,
                    execute,
                    filter,
                    keys,
                    limit,
                    modify
                };
            };

            return {
                count,
                desc,
                distinct,
                execute,
                filter,
                keys,
                limit,
                map,
                modify
            };
        };

        ['only', 'bound', 'upperBound', 'lowerBound'].forEach((name) => {
            this[name] = function () {
                return Query(name, arguments);
            };
        });

        this.range = function (opts) {
            let error;
            let keyRange = [null, null];
            try {
                keyRange = mongoDBToKeyRangeArgs(opts);
            } catch (e) {
                error = e;
            }
            return Query(...keyRange, error);
        };

        this.filter = function (...args) {
            const query = Query(null, null);
            return query.filter(...args);
        };

        this.all = function () {
            return this.filter();
        };
    };

    const Server = function (db, name, version, noServerMethods, upgradeTransaction) {
        let closed = false;

        this.getIndexedDB = () => db;
        this.isClosed = () => closed;

        this.query = function (table, index) {
            const error = closed ? new Error('Database has been closed') : null;
            return new IndexQuery(table, db, index, error, upgradeTransaction); // Does not throw by itself
        };

        this.add = function (table, ...args) {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }

                const records = args.reduce(function (records, aip) {
                    return records.concat(aip);
                }, []);

                const transaction = upgradeTransaction || db.transaction(table, transactionModes.readwrite);
                transaction.onerror = e => {
                    // prevent throwing a ConstraintError and aborting (hard)
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                    e.preventDefault();
                    reject(e);
                };
                transaction.onabort = e => reject(e);
                transaction.oncomplete = () => resolve(records);

                const store = transaction.objectStore(table);
                records.some(function (record) {
                    let req, key;
                    if (isObject(record) && hasOwn.call(record, 'item')) {
                        key = record.key;
                        record = record.item;
                        if (key != null) {
                            if (!trySync(function () {
                                key = mongoifyKey(key);
                            }, reject)) {
                                return true;
                            }
                        }
                    }

                    if (!trySync(function () {
                        // Safe to add since in readwrite
                        if (key != null) {
                            req = store.add(record, key);
                        } else {
                            req = store.add(record);
                        }
                    }, reject)) {
                        return true;
                    }

                    req.onsuccess = function (e) {
                        if (!isObject(record)) {
                            return;
                        }
                        const target = e.target;
                        let keyPath = target.source.keyPath;
                        if (keyPath === null) {
                            keyPath = '__id__';
                        }
                        if (hasOwn.call(record, keyPath)) {
                            return;
                        }
                        Object.defineProperty(record, keyPath, {
                            value: target.result,
                            enumerable: true
                        });
                    };
                });
            });
        };

        this.update = function (table, ...args) {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }

                const records = args.reduce(function (records, aip) {
                    return records.concat(aip);
                }, []);

                const transaction = upgradeTransaction || db.transaction(table, transactionModes.readwrite);
                transaction.onerror = e => {
                    // prevent throwing aborting (hard)
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                    e.preventDefault();
                    reject(e);
                };
                transaction.onabort = e => reject(e);
                transaction.oncomplete = () => resolve(records);

                const store = transaction.objectStore(table);

                records.some(function (record) {
                    let req, key;
                    if (isObject(record) && hasOwn.call(record, 'item')) {
                        key = record.key;
                        record = record.item;
                        if (key != null) {
                            if (!trySync(function () {
                                key = mongoifyKey(key);
                            }, reject)) {
                                return true;
                            }
                        }
                    }

                    if (!trySync(function () {
                        if (key != null) {
                            req = store.put(record, key);
                        } else {
                            req = store.put(record);
                        }
                    }, reject)) {
                        return;
                    }

                    req.onsuccess = function (e) {
                        if (!isObject(record)) {
                            return;
                        }
                        const target = e.target;
                        let keyPath = target.source.keyPath;
                        if (keyPath === null) {
                            keyPath = '__id__';
                        }
                        if (hasOwn.call(record, keyPath)) {
                            return;
                        }
                        Object.defineProperty(record, keyPath, {
                            value: target.result,
                            enumerable: true
                        });
                    };
                });
            });
        };

        this.put = function (...args) {
            return this.update(...args);
        };

        this.remove = function (table, key) {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }
                if (!trySync(function () {
                    key = mongoifyKey(key);
                }, reject)) {
                    return;
                }

                const transaction = upgradeTransaction || db.transaction(table, transactionModes.readwrite);
                transaction.onerror = e => {
                    // prevent throwing and aborting (hard)
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                    e.preventDefault();
                    reject(e);
                };
                transaction.onabort = e => reject(e);
                transaction.oncomplete = () => resolve(key);

                const store = transaction.objectStore(table);
                if (!trySync(function () {
                    store.delete(key);
                }, reject)) {
                    return;
                }
            });
        };

        this.delete = function (...args) {
            return this.remove(...args);
        };

        this.del = function (...args) {
            return this.remove(...args);
        };

        this.clear = function (table) {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }
                const transaction = upgradeTransaction || db.transaction(table, transactionModes.readwrite);
                transaction.onerror = e => reject(e);
                transaction.onabort = e => reject(e);
                transaction.oncomplete = () => resolve();

                const store = transaction.objectStore(table);
                store.clear();
            });
        };

        this.close = function () {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }
                closed = true;
                delete dbCache[name][version];
                db.close();
                runAsync(function () {
                    resolve();
                });
            });
        };

        this.get = function (table, key) {
            return new Promise(function (resolve, reject) {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }
                if (!trySync(function () {
                    key = mongoifyKey(key);
                }, reject)) {
                    return;
                }

                const transaction = upgradeTransaction || db.transaction(table);
                transaction.onerror = e => {
                    // prevent throwing and aborting (hard)
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                    e.preventDefault();
                    reject(e);
                };
                transaction.onabort = e => reject(e);

                const store = transaction.objectStore(table);

                let req;
                if (!trySync(function () {
                    req = store.get(key);
                }, reject)) {
                    return;
                }
                req.onsuccess = e => resolve(e.target.result);
            });
        };

        this.count = function (table, key) {
            return new Promise((resolve, reject) => {
                if (closed) {
                    runAsync(function () {
                        reject(new Error('Database has been closed'));
                    });
                    return;
                }
                if (!trySync(function () {
                    key = mongoifyKey(key);
                }, reject)) {
                    return;
                }

                const transaction = upgradeTransaction || db.transaction(table);
                transaction.onerror = e => {
                    // prevent throwing and aborting (hard)
                    // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                    e.preventDefault();
                    reject(e);
                };
                transaction.onabort = e => reject(e);

                const store = transaction.objectStore(table);

                let req;
                if (!trySync(function () {
                    req = key == null ? store.count() : store.count(key);
                }, reject)) {
                    return;
                }
                req.onsuccess = e => resolve(e.target.result);
            });
        };

        this.addEventListener = function (eventName, handler) {
            if (!serverEvents.includes(eventName)) {
                throw new Error('Unrecognized event type ' + eventName);
            }
            if (eventName === 'error') {
                db.addEventListener(eventName, function (e) {
                    e.preventDefault(); // Needed to prevent hard abort with ConstraintError
                    handler(e);
                });
                return;
            }
            db.addEventListener(eventName, handler);
        };

        this.removeEventListener = function (eventName, handler) {
            if (!serverEvents.includes(eventName)) {
                throw new Error('Unrecognized event type ' + eventName);
            }
            db.removeEventListener(eventName, handler);
        };

        serverEvents.forEach(function (evName) {
            this[evName] = function (handler) {
                this.addEventListener(evName, handler);
                return this;
            };
        }, this);

        if (noServerMethods) {
            return;
        }

        let err;
        [].some.call(db.objectStoreNames, storeName => {
            if (this[storeName]) {
                err = new Error('The store name, "' + storeName + '", which you have attempted to load, conflicts with db.js method names."');
                this.close();
                return true;
            }
            this[storeName] = {};
            const keys = Object.keys(this);
            keys.filter(key => !(([...serverEvents, 'close', 'addEventListener', 'removeEventListener']).includes(key)))
                .map(key =>
                    this[storeName][key] = (...args) => this[key](storeName, ...args)
                );
        });
        return err;
    };

    const createSchema = function (e, request, schema, db, server, version, clearUnusedStores) {
        if (!schema || schema.length === 0) {
            return;
        }

        if (clearUnusedStores) {
            for (let i = 0; i < db.objectStoreNames.length; i++) {
                const name = db.objectStoreNames[i];
                if (!hasOwn.call(schema, name)) {
                    // Errors for which we are not concerned and why:
                    // `InvalidStateError` - We are in the upgrade transaction.
                    // `TransactionInactiveError` (as by the upgrade having already
                    //      completed or somehow aborting) - since we've just started and
                    //      should be without risk in this loop
                    // `NotFoundError` - since we are iterating the dynamically updated
                    //      `objectStoreNames`
                    db.deleteObjectStore(name);
                }
            }
        }

        let ret;
        Object.keys(schema).some(function (tableName) {
            const table = schema[tableName];
            let store;
            if (db.objectStoreNames.contains(tableName)) {
                store = request.transaction.objectStore(tableName); // Shouldn't throw
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
                try {
                    store = db.createObjectStore(tableName, table.key);
                } catch (err) {
                    ret = err;
                    return true;
                }
            }

            Object.keys(table.indexes || {}).some(function (indexKey) {
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
                    try {
                        store.createIndex(indexKey, index.keyPath || index.key || indexKey, index);
                    } catch (err2) {
                        ret = err2;
                        return true;
                    }
                }
            });
        });
        return ret;
    };

    const open = function (e, server, version, noServerMethods, upgradeTransaction) {
        const db = e.target.result;

        if (!upgradeTransaction) { // We don't want to cache, especially if `upgradeTransaction`
                                   // fails and thus does not properly overwrite with the real
                                   // reusable object
            dbCache[server][version] = db;
        }

        return new Server(db, server, version, noServerMethods, upgradeTransaction);
    };

    const db = {
        version: '0.14.0',
        open: function (options) {
            const server = options.server;
            const noServerMethods = options.noServerMethods;
            const clearUnusedStores = options.clearUnusedStores !== false;
            let version = options.version || 1;
            let schema = options.schema;

            if (!dbCache[server]) {
                dbCache[server] = {};
            }
            return new Promise(function (resolve, reject) {
                if (dbCache[server][version]) {
                    const s = open({
                        target: {
                            result: dbCache[server][version]
                        }
                    }, server, version, noServerMethods);
                    if (s instanceof Error) {
                        runAsync(function () {
                            reject(s);
                        });
                        return;
                    }
                    runAsync(function () {
                        resolve(s);
                    });
                } else {
                    let idbschema;
                    if (options.schemaBuilder) {
                        idbschema = new IdbSchema();
                        if (!trySync(function () {
                            options.schemaBuilder(idbschema);
                            const idbschemaVersion = idbschema.version();
                            if (options.version && idbschemaVersion < version) {
                                throw new Error(
                                    'Your highest schema building (IDBSchema) version (' + idbschemaVersion + ') ' +
                                    'must not be less than your designated version (' + version + ').'
                                );
                            }
                            if (!options.version && idbschemaVersion > version) {
                                version = idbschemaVersion;
                            }
                        }, reject)) {
                            return;
                        }
                    }
                    if (typeof schema === 'function') {
                        try {
                            schema = schema();
                        } catch (e) {
                            runAsync(function () {
                                reject(e);
                            });
                            return;
                        }
                    }

                    const request = indexedDB.open(server, version);
                    request.onsuccess = e => {
                        const s = open(e, server, version, noServerMethods);
                        if (s instanceof Error) {
                            runAsync(function () {
                                reject(s);
                            });
                            return;
                        }
                        resolve(s);
                    };
                    request.onerror = e => {
                        // Prevent default for `BadVersion` and `AbortError` errors, etc.
                        // These are not necessarily reported in console in Chrome but present; see
                        //  https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                        //  http://stackoverflow.com/questions/36225779/aborterror-within-indexeddb-upgradeneeded-event/36266502
                        e.preventDefault();
                        reject(e);
                    };
                    request.onupgradeneeded = e => {
                        if (idbschema) {
                            trySync(function () {
                                const s = open(e, server, version, noServerMethods, e.target.transaction);
                                delete s.close; // Closing should not be done in `upgradeneeded`
                                e.dbjs = function (cb) { // returning a Promise here led to problems with Firefox which
                                                       //    would lose the upgrade transaction by the time the user
                                                       //    callback sought to use the Server in a (modify) query,
                                                       //    perhaps due to this: http://stackoverflow.com/a/28388805/271577
                                    if (s instanceof Error) {
                                        runAsync(function () {
                                            reject(s);
                                        });
                                        return;
                                    }
                                    cb(s);
                                };
                                idbschema.callback()(e);
                            }, reject);
                            return;
                        }
                        const err = createSchema(e, request, schema, e.target.result, server, version, clearUnusedStores);
                        if (err) {
                            runAsync(function () {
                                reject(err);
                            });
                        }
                    };
                    request.onblocked = e => {
                        const resume = new Promise(function (res, rej) {
                            // We overwrite handlers rather than make a new
                            //   open() since the original request is still
                            //   open and its onsuccess will still fire if
                            //   the user unblocks by closing the blocking
                            //   connection
                            request.onsuccess = (ev) => {
                                const s = open(ev, server, version, noServerMethods);
                                if (s instanceof Error) {
                                    rej(s);
                                    return;
                                }
                                res(s);
                            };
                            request.onerror = e => rej(e);
                        });
                        e.resume = resume;
                        reject(e);
                    };
                }
            });
        },

        delete: function (dbName) {
            return new Promise(function (resolve, reject) {
                const request = indexedDB.deleteDatabase(dbName); // Does not throw

                request.onsuccess = e => resolve(e);
                request.onerror = e => reject(e); // No errors currently
                request.onblocked = e => {
                    // The following addresses part of https://bugzilla.mozilla.org/show_bug.cgi?id=1220279
                    e = e.newVersion === null || typeof Proxy === 'undefined' ? e : new Proxy(e, {get: function (target, name) {
                        return name === 'newVersion' ? null : target[name];
                    }});
                    const resume = new Promise(function (res, rej) {
                        // We overwrite handlers rather than make a new
                        //   delete() since the original request is still
                        //   open and its onsuccess will still fire if
                        //   the user unblocks by closing the blocking
                        //   connection
                        request.onsuccess = ev => {
                            // The following are needed currently by PhantomJS: https://github.com/ariya/phantomjs/issues/14141
                            if (!('newVersion' in ev)) {
                                ev.newVersion = e.newVersion;
                            }

                            if (!('oldVersion' in ev)) {
                                ev.oldVersion = e.oldVersion;
                            }

                            res(ev);
                        };
                        request.onerror = e => rej(e);
                    });
                    e.resume = resume;
                    reject(e);
                };
            });
        },

        cmp: function (param1, param2) {
            return new Promise(function (resolve, reject) {
                if (!trySync(function () {
                    return indexedDB.cmp(param1, param2);
                }, reject, resolve)) {
                    return;
                }
            });
        }
    };

    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        module.exports = db;
    } else if (typeof define === 'function' && define.amd) {
        define(function () { return db; });
    } else {
        local.db = db;
    }
}(self, SyncPromise));
