/*global Promise, define, window*/
/*jslint vars:true, continue:true*/
/*eslint no-loop-func: 0, no-unused-vars: 0, guard-for-in: 0*/
var module;
(function (window) {
    'use strict';

    var indexedDB,
        IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange,
        transactionModes = {
            readonly: 'readonly',
            readwrite: 'readwrite'
        };

    var hasOwn = Object.prototype.hasOwnProperty;

    var getIndexedDB = function () {
        if (!indexedDB) {
            indexedDB = window.indexedDB || window.webkitIndexedDB ||
              window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB ||
              (window.indexedDB === null && window.shimIndexedDB ?
                window.shimIndexedDB : undefined
            );

            if (!indexedDB) {
                throw 'IndexedDB required';
            }
        }
        return indexedDB;
    };

    var defaultMapper = function (value) {
        return value;
    };

    var dbCache = {};
    var isArray = Array.isArray;

    var IndexQuery = function (table, db, indexName) {
        var modifyObj = false;

        var runQuery = function (type, args, cursorType, direction, limitRange, filters, mapper) {
            var transaction = db.transaction(table, modifyObj ? transactionModes.readwrite : transactionModes.readonly),
                store = transaction.objectStore(table),
                index = indexName ? store.index(indexName) : store,
                keyRange = type ? IDBKeyRange[type].apply(null, args) : null,
                results = [],
                indexArgs = [keyRange],
                counter = 0;

            limitRange = limitRange || null;
            filters = filters || [];
            if (cursorType !== 'count') {
                indexArgs.push(direction || 'next');
            }

            // create a function that will set in the modifyObj properties into
            // the passed record.
            var modifyKeys = modifyObj ? Object.keys(modifyObj) : false;
            var modifyRecord = function (record) {
                var i;
                for (i = 0; i < modifyKeys.length; i++) {
                    var key = modifyKeys[i];
                    var val = modifyObj[key];
                    if (val instanceof Function) {val = val(record);}
                    record[key] = val;
                }
                return record;
            };

            index[cursorType].apply(index, indexArgs).onsuccess = function (e) {
                var cursor = e.target.result;
                if (typeof cursor === 'number') {
                    results = cursor;
                } else if (cursor) {
                    if (limitRange !== null && limitRange[0] > counter) {
                        counter = limitRange[0];
                        cursor.advance(limitRange[0]);
                    } else if (limitRange !== null && counter >= (limitRange[0] + limitRange[1])) {
                        // out of limit range... skip
                    } else {
                        var matchFilter = true;
                        var result = 'value' in cursor ? cursor.value : cursor.key;

                        filters.forEach(function (filter) {
                            if (!filter || !filter.length) {
                                // Invalid filter do nothing
                            } else if (filter.length === 2) {
                                matchFilter = matchFilter && (result[filter[0]] === filter[1]);
                            } else {
                                matchFilter = matchFilter && filter[0].apply(undefined, [result]);
                            }
                        });

                        if (matchFilter) {
                            counter++;
                            results.push(mapper(result));
                            // if we're doing a modify, run it now
                            if (modifyObj) {
                                result = modifyRecord(result);
                                cursor.update(result);
                            }
                        }
                        cursor.continue();
                    }
                }
            };

            return new Promise(function (resolve, reject) {
                transaction.oncomplete = function () {
                    resolve(results);
                };
                transaction.onerror = function (e) {
                    reject(e);
                };
                transaction.onabort = function (e) {
                    reject(e);
                };
            });
        };

        var Query = function (type, args) {
            var direction = 'next',
                cursorType = 'openCursor',
                filters = [],
                limitRange = null,
                mapper = defaultMapper,
                unique = false;

            var execute = function () {
                return runQuery(type, args, cursorType, unique ? direction + 'unique' : direction, limitRange, filters, mapper);
            };

            var limit = function () {
                limitRange = Array.prototype.slice.call(arguments, 0, 2);
                if (limitRange.length === 1) {
                    limitRange.unshift(0);
                }

                return {
                    execute: execute
                };
            };
            var count = function () {
                direction = null;
                cursorType = 'count';

                return {
                    execute: execute
                };
            };

            var filter, desc, distinct, modify, map;
            var keys = function () {
                cursorType = 'openKeyCursor';

                return {
                    desc: desc,
                    execute: execute,
                    filter: filter,
                    distinct: distinct,
                    map: map
                };
            };
            filter = function () {
                filters.push(Array.prototype.slice.call(arguments, 0, 2));

                return {
                    keys: keys,
                    execute: execute,
                    filter: filter,
                    desc: desc,
                    distinct: distinct,
                    modify: modify,
                    limit: limit,
                    map: map
                };
            };
            desc = function () {
                direction = 'prev';

                return {
                    keys: keys,
                    execute: execute,
                    filter: filter,
                    distinct: distinct,
                    modify: modify,
                    map: map
                };
            };
            distinct = function () {
                unique = true;
                return {
                    keys: keys,
                    count: count,
                    execute: execute,
                    filter: filter,
                    desc: desc,
                    modify: modify,
                    map: map
                };
            };
            modify = function (update) {
                modifyObj = update;
                return {
                    execute: execute
                };
            };
            map = function (fn) {
                mapper = fn;

                return {
                    execute: execute,
                    count: count,
                    keys: keys,
                    filter: filter,
                    desc: desc,
                    distinct: distinct,
                    modify: modify,
                    limit: limit,
                    map: map
                };
            };

            return {
                execute: execute,
                count: count,
                keys: keys,
                filter: filter,
                desc: desc,
                distinct: distinct,
                modify: modify,
                limit: limit,
                map: map
            };
        };

        ['only', 'bound', 'upperBound', 'lowerBound'].forEach(function (name) {
            this[name] = function () {
                return new Query(name, arguments);
            };
        }, this);

        this.range = function (opts) {
            var keys = Object.keys(opts).sort();
            if (keys.length === 1) {
                var key = keys[0];
                var val = opts[key];
                var name, inclusive;
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
                default: throw new TypeError('`' + key + '` is not valid key');
                }
                return new Query(name, [val, inclusive]);
            }
            var x = opts[keys[0]];
            var y = opts[keys[1]];
            var pattern = keys.join('-');

            switch (pattern) {
            case 'gt-lt': case 'gt-lte': case 'gte-lt': case 'gte-lte':
                return new Query('bound', [x, y, keys[0] === 'gt', keys[1] === 'lt']);
            default: throw new TypeError(
              '`' + pattern + '` are conflicted keys'
            );
            }
        };

        this.filter = function () {
            var query = new Query(null, null);
            return query.filter.apply(query, arguments);
        };

        this.all = function () {
            return this.filter();
        };
    };
    var Server = function (db, name) {
        this.db = db;
        this.name = name;
        this.closed = false;
        var that = this;

        var i, il;
        for (i = 0, il = db.objectStoreNames.length; i < il; i++) {
            (function (storeName) {
                if (that[storeName]) {
                    throw 'The store name, "' + storeName + '", which you have attempted to load, conflicts with db.js method names."';
                }
                that[storeName] = {};
                var p;
                for (p in that) {
                    if (p === storeName || p === 'close' || typeof that[p] !== 'function') {
                        continue;
                    }
                    that[storeName][p] = (function (prop) {
                        return function () {
                            var args = [storeName].concat([].slice.call(arguments, 0));
                            return that[prop].apply(that, args);
                        };
                    }(p));
                }
            }(db.objectStoreNames[i]));
        }
    };
    Server.prototype.getIndexedDB = function () {
        return this.db;
    };

    Server.prototype.add = function (table) {
        if (this.closed) {
            throw 'Database has been closed';
        }

        var that = this;
        var records = [];
        var counter = 0;

        var i, alm;
        for (i = 0, alm = arguments.length - 1; i < alm; i++) {
            var aip = arguments[i + 1];
            if (isArray(aip)) {
                var j, aipl = aip.length;
                for (j = 0; j < aipl; j++) {
                    records[counter] = aip[j];
                    counter++;
                }
            } else {
                records[counter] = aip;
                counter++;
            }
        }

        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        return new Promise(function (resolve, reject) {
            records.forEach(function (record) {
                var req;
                if (record.item && record.key) {
                    var key = record.key;
                    record = record.item;
                    req = store.add(record, key);
                } else {
                    req = store.add(record);
                }

                req.onsuccess = function (e) {
                    var target = e.target;
                    var keyPath = target.source.keyPath;
                    if (keyPath === null) {
                        keyPath = '__id__';
                    }
                    Object.defineProperty(record, keyPath, {
                        value: target.result,
                        enumerable: true
                    });
                };
            });

            transaction.oncomplete = function () {
                resolve(records, that);
            };
            transaction.onerror = function (e) {
                // prevent Firefox from throwing a ConstraintError and
                // aborting (hard)
                // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
                e.preventDefault();
                reject(e);
            };
            transaction.onabort = function (e) {
                reject(e);
            };

        });
    };

    Server.prototype.update = function (table) {
        if (this.closed) {
            throw 'Database has been closed';
        }

        var that = this;
        var records = [];
        var counter = 0;

        var i, alm;
        for (i = 0, alm = arguments.length - 1; i < alm; i++) {
            var aip = arguments[i + 1];
            if (isArray(aip)) {
                var j, aipl = aip.length;
                for (j = 0; j < aipl; j++) {
                    records[counter] = aip[j];
                    counter++;
                }
            } else {
                records[counter] = aip;
                counter++;
            }
        }

        var transaction =
            this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        return new Promise(function (resolve, reject) {
            records.forEach(function (record) {
                var req;
                if (record.item && record.key) {
                    var key = record.key;
                    record = record.item;
                    req = store.put(record, key);
                } else {
                    req = store.put(record);
                }

                req.onsuccess = function (/* e */) {
                    // deferred.notify(); es6 promise can't notify
                };
            });

            transaction.oncomplete = function () {
                resolve(records, that);
            };
            transaction.onerror = function (e) {
                reject(e);
            };
            transaction.onabort = function (e) {
                reject(e);
            };
        });
    };

    Server.prototype.remove = function (table, key) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        return new Promise(function (resolve, reject) {
            var req = store.delete(key);
            transaction.oncomplete = function () {
                resolve(key);
            };
            transaction.onerror = function (e) {
                reject(e);
            };
        });
    };

    Server.prototype.clear = function (table) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table, transactionModes.readwrite),
            store = transaction.objectStore(table);

        var req = store.clear();
        return new Promise(function (resolve, reject) {
            transaction.oncomplete = function () {
                resolve();
            };
            transaction.onerror = function (e) {
                reject(e);
            };
        });
    };

    Server.prototype.close = function () {
        if (this.closed) {
            throw 'Database has been closed';
        }
        this.db.close();
        this.closed = true;
        delete dbCache[this.name];
    };

    Server.prototype.get = function (table, id) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table),
            store = transaction.objectStore(table);

        var req = store.get(id);
        return new Promise(function (resolve, reject) {
            req.onsuccess = function (e) {
                resolve(e.target.result);
            };
            transaction.onerror = function (e) {
                reject(e);
            };
        });
    };

    Server.prototype.query = function (table, index) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        return new IndexQuery(table, this.db, index);
    };

    Server.prototype.count = function (table /*, key*/) {
        if (this.closed) {
            throw 'Database has been closed';
        }
        var transaction = this.db.transaction(table),
            store = transaction.objectStore(table);
    };


    var createSchema = function (e, schema, db) {
        if (typeof schema === 'function') {
            schema = schema();
        }

        var tableName;
        for (tableName in schema) {
            var table = schema[tableName];
            var store;
            if (!hasOwn.call(schema, tableName) || db.objectStoreNames.contains(tableName)) {
                store = e.currentTarget.transaction.objectStore(tableName);
            } else {
                store = db.createObjectStore(tableName, table.key);
            }

            var indexKey;
            for (indexKey in table.indexes) {
                var index = table.indexes[indexKey];
                try {
                    store.index(indexKey);
                } catch (err) {
                    store.createIndex(indexKey, index.key || indexKey, Object.keys(index).length ? index : {unique: false});
                }
            }
        }
    };

    var open = function (e, server /*, version, schema*/) {
        var db = e.target.result;
        var s = new Server(db, server);

        dbCache[server] = db;

        return Promise.resolve(s);
    };

    var db = {
        version: '0.10.2',
        open: function (options) {
            var request;

            return new Promise(function (resolve, reject) {
                if (dbCache[options.server]) {
                    open({
                        target: {
                            result: dbCache[options.server]
                        }
                    }, options.server, options.version, options.schema).
                    then(resolve, reject);
                } else {
                    request = getIndexedDB().open(options.server, options.version);

                    request.onsuccess = function (e) {
                        open(e, options.server, options.version, options.schema).
                            then(resolve, reject);
                    };

                    request.onupgradeneeded = function (e) {
                        createSchema(e, options.schema, e.target.result);
                    };
                    request.onerror = function (e) {
                        reject(e);
                    };
                }
            });
        },
        delete: function (dbName) {
            var request;

            return new Promise(function (resolve, reject) {
                request = indexedDB.deleteDatabase(dbName);

                request.onsuccess = function () {
                    resolve();
                };
                request.onerror = function (e) {
                    reject(e);
                };
                request.onblocked = function (e) {
                    reject(e);
                };
            });
        }
    };

    if (module !== undefined && module.exports !== undefined) {
        module.exports = db;
    } else if (typeof define === 'function' && define.amd) {
        define(function () {return db;});
    } else {
        window.db = db;
    }
}(window));
