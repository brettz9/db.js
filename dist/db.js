"use strict";

var _idbImport = require("./idb-import");

var _idbImport2 = _interopRequireDefault(_idbImport);

var _idbBatch = require("idb-batch");

var _idbBatch2 = _interopRequireDefault(_idbBatch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _toConsumableArray(arr) { return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread(); }

function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance"); }

function _iterableToArray(iter) { if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter); }

function _arrayWithoutHoles(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

(function (local) {
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;

  var indexedDB = local.indexedDB || local.webkitIndexedDB || local.mozIndexedDB || local.oIndexedDB || local.msIndexedDB || local.shimIndexedDB || function () {
    throw new Error('IndexedDB required');
  }();

  var IDBKeyRange = local.IDBKeyRange || local.webkitIDBKeyRange;

  var defaultMapper = function defaultMapper(x) {
    return x;
  };

  var serverEvents = ['abort', 'error', 'versionchange'];
  var transactionModes = {
    readonly: 'readonly',
    readwrite: 'readwrite'
  };
  var dbCache = {};

  function isObject(item) {
    return item && _typeof(item) === 'object';
  }

  function mongoDBToKeyRangeArgs(opts) {
    var keys = Object.keys(opts).sort();

    if (keys.length === 1) {
      var key = keys[0];
      var val = opts[key];
      var name, inclusive;

      switch (key) {
        case 'eq':
          name = 'only';
          break;

        case 'gt':
          name = 'lowerBound';
          inclusive = true;
          break;

        case 'lt':
          name = 'upperBound';
          inclusive = true;
          break;

        case 'gte':
          name = 'lowerBound';
          break;

        case 'lte':
          name = 'upperBound';
          break;

        default:
          throw new TypeError('`' + key + '` is not a valid key');
      }

      return [name, [val, inclusive]];
    }

    var x = opts[keys[0]];
    var y = opts[keys[1]];
    var pattern = keys.join('-');

    switch (pattern) {
      case 'gt-lt':
      case 'gt-lte':
      case 'gte-lt':
      case 'gte-lte':
        return ['bound', [x, y, keys[0] === 'gt', keys[1] === 'lt']];

      default:
        throw new TypeError('`' + pattern + '` are conflicted keys');
    }
  }

  function mongoifyKey(key) {
    if (key && _typeof(key) === 'object' && !(key instanceof IDBKeyRange)) {
      var _mongoDBToKeyRangeArg = mongoDBToKeyRangeArgs(key),
          _mongoDBToKeyRangeArg2 = _slicedToArray(_mongoDBToKeyRangeArg, 2),
          type = _mongoDBToKeyRangeArg2[0],
          args = _mongoDBToKeyRangeArg2[1];

      return IDBKeyRange[type].apply(IDBKeyRange, _toConsumableArray(args));
    }

    return key;
  }

  var IndexQuery = function IndexQuery(table, db, indexName, preexistingError, trans) {
    var _this = this;

    var modifyObj = null;

    var runQuery = function runQuery(type, args, cursorType, direction, limitRange, filters, mapper) {
      return new Promise(function (resolve, reject) {
        var keyRange = type ? IDBKeyRange[type].apply(IDBKeyRange, _toConsumableArray(args)) : null; // May throw

        filters = filters || [];
        limitRange = limitRange || null;
        var results = [];
        var counter = 0;
        var indexArgs = [keyRange];
        var transaction = trans || db.transaction(table, modifyObj ? transactionModes.readwrite : transactionModes.readonly);
        transaction.addEventListener('error', function (e) {
          return reject(e);
        });
        transaction.addEventListener('abort', function (e) {
          return reject(e);
        });
        transaction.addEventListener('complete', function () {
          return resolve(results);
        });
        var store = transaction.objectStore(table); // if bad, db.transaction will reject first

        var index = typeof indexName === 'string' ? store.index(indexName) : store;

        if (cursorType !== 'count') {
          indexArgs.push(direction || 'next');
        } // Create a function that will set in the modifyObj properties into
        // the passed record.


        var modifyKeys = modifyObj ? Object.keys(modifyObj) : [];

        var modifyRecord = function modifyRecord(record) {
          modifyKeys.forEach(function (key) {
            var val = modifyObj[key];

            if (typeof val === 'function') {
              val = val(record);
            }

            record[key] = val;
          });
          return record;
        };

        index[cursorType].apply(index, indexArgs).onsuccess = function (e) {
          // indexArgs are already validated
          var cursor = e.target.result;

          if (typeof cursor === 'number') {
            results = cursor;
          } else if (cursor) {
            if (limitRange !== null && limitRange[0] > counter) {
              counter = limitRange[0];
              cursor.advance(limitRange[0]); // Will throw on 0, but condition above prevents since counter always 0+
            } else if (limitRange !== null && counter >= limitRange[0] + limitRange[1]) {// Out of limit range... skip
            } else {
              var matchFilter = true;
              var result = 'value' in cursor ? cursor.value : cursor.key;

              try {
                // We must manually catch for this promise as we are within an async event function
                filters.forEach(function (filter) {
                  var propObj = filter[0];

                  if (typeof propObj === 'function') {
                    matchFilter = matchFilter && propObj(result); // May throw with filter on non-object
                  } else {
                    if (!propObj || _typeof(propObj) !== 'object') {
                      propObj = _defineProperty({}, propObj, filter[1]);
                    }

                    Object.keys(propObj).forEach(function (prop) {
                      matchFilter = matchFilter && result[prop] === propObj[prop]; // May throw with error in filter function
                    });
                  }
                });

                if (matchFilter) {
                  counter++; // If we're doing a modify, run it now

                  if (modifyObj) {
                    result = modifyRecord(result); // May throw

                    cursor.update(result); // May throw as `result` should only be a "structured clone"-able object
                  }

                  results.push(mapper(result)); // May throw
                }
              } catch (err) {
                reject(err);
                return;
              }

              cursor["continue"]();
            }
          }
        };
      });
    };

    var Query = function Query(type, args, queuedError) {
      var filters = [];
      var direction = 'next';
      var cursorType = 'openCursor';
      var limitRange = null;
      var mapper = defaultMapper;
      var unique = false;
      var error = preexistingError || queuedError;

      var execute = function execute() {
        if (error) {
          return Promise.reject(error);
        }

        return runQuery(type, args, cursorType, unique ? direction + 'unique' : direction, limitRange, filters, mapper);
      };

      var count = function count() {
        direction = null;
        cursorType = 'count';
        return {
          execute: execute
        };
      };

      var keys = function keys() {
        cursorType = 'openKeyCursor';
        return {
          desc: desc,
          distinct: distinct,
          execute: execute,
          filter: filter,
          limit: limit,
          map: map
        };
      };

      var limit = function limit(start, end) {
        limitRange = !end ? [0, start] : [start, end];
        error = limitRange.some(function (val) {
          return typeof val !== 'number';
        }) ? new Error('limit() arguments must be numeric') : error;
        return {
          desc: desc,
          distinct: distinct,
          filter: filter,
          keys: keys,
          execute: execute,
          map: map,
          modify: modify
        };
      };

      var filter = function filter(prop, val) {
        filters.push([prop, val]);
        return {
          desc: desc,
          distinct: distinct,
          execute: execute,
          filter: filter,
          keys: keys,
          limit: limit,
          map: map,
          modify: modify
        };
      };

      var desc = function desc() {
        direction = 'prev';
        return {
          distinct: distinct,
          execute: execute,
          filter: filter,
          keys: keys,
          limit: limit,
          map: map,
          modify: modify
        };
      };

      var distinct = function distinct() {
        unique = true;
        return {
          count: count,
          desc: desc,
          execute: execute,
          filter: filter,
          keys: keys,
          limit: limit,
          map: map,
          modify: modify
        };
      };

      var modify = function modify(update) {
        modifyObj = update && _typeof(update) === 'object' ? update : null;
        return {
          execute: execute
        };
      };

      var map = function map(fn) {
        mapper = fn;
        return {
          count: count,
          desc: desc,
          distinct: distinct,
          execute: execute,
          filter: filter,
          keys: keys,
          limit: limit,
          modify: modify
        };
      };

      return {
        count: count,
        desc: desc,
        distinct: distinct,
        execute: execute,
        filter: filter,
        keys: keys,
        limit: limit,
        map: map,
        modify: modify
      };
    };

    ['only', 'bound', 'upperBound', 'lowerBound'].forEach(function (name) {
      _this[name] = function () {
        return Query(name, arguments);
      };
    });

    this.range = function (opts) {
      var error;
      var keyRange = [null, null];

      try {
        keyRange = mongoDBToKeyRangeArgs(opts);
      } catch (e) {
        error = e;
      }

      return Query.apply(void 0, _toConsumableArray(keyRange).concat([error]));
    };

    this.filter = function () {
      var query = Query(null, null);
      return query.filter.apply(query, arguments);
    };

    this.all = function () {
      return this.filter();
    };
  };

  var Server = function Server(db, name, version, noServerMethods) {
    var _this2 = this;

    var closed = false;
    var trans;

    var setupTransactionAndStore = function setupTransactionAndStore(db, table, records, resolve, reject, readonly) {
      var transaction = trans || db.transaction(table, readonly ? transactionModes.readonly : transactionModes.readwrite);
      transaction.addEventListener('error', function (e) {
        // prevent throwing aborting (hard)
        // https://bugzilla.mozilla.org/show_bug.cgi?id=872873
        e.preventDefault();
        reject(e);
      });
      transaction.addEventListener('abort', function (e) {
        return reject(e);
      });
      transaction.addEventListener('complete', function () {
        return resolve(records);
      });
      return transaction.objectStore(table);
    };

    var adapterCb = function adapterCb(tr, cb) {
      if (!trans) trans = tr;
      return cb(tr, _this2);
    };

    this.getIndexedDB = function () {
      return db;
    };

    this.isClosed = function () {
      return closed;
    };

    this.batch = function (storeOpsArr) {
      var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {
        extraStores: [],
        parallel: false
      };
      opts = opts || {};
      var _opts = opts,
          extraStores = _opts.extraStores,
          parallel = _opts.parallel; // We avoid `resolveEarly`

      return (0, _idbBatch.transactionalBatch)(db, storeOpsArr, {
        adapterCb: adapterCb,
        extraStores: extraStores,
        parallel: parallel
      }).then(function (res) {
        trans = undefined;
        return res;
      });
    };

    this.tableBatch = function (table, ops) {
      var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {
        parallel: false
      };
      opts = opts || {};
      return (0, _idbBatch2["default"])(db, table, ops, {
        adapterCb: adapterCb,
        parallel: opts.parallel
      }).then(function (res) {
        trans = undefined;
        return res;
      });
    };

    this.query = function (table, index) {
      var error = closed ? new Error('Database has been closed') : null;
      return new IndexQuery(table, db, index, error, trans); // Does not throw by itself
    };

    this.add = function (table) {
      for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
      }

      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        var records = args.reduce(function (records, aip) {
          return records.concat(aip);
        }, []);
        var store = setupTransactionAndStore(db, table, records, resolve, reject);
        records.some(function (record) {
          var req, key;

          if (isObject(record) && hasOwn.call(record, 'item')) {
            key = record.key;
            record = record.item;

            if (key != null) {
              key = mongoifyKey(key); // May throw
            }
          } // Safe to add since in readwrite, but may still throw


          if (key != null) {
            req = store.add(record, key);
          } else {
            req = store.add(record);
          }

          req.onsuccess = function (e) {
            if (!isObject(record)) {
              return;
            }

            var target = e.target;
            var keyPath = target.source.keyPath;

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

    this.update = function (table) {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }

      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        var records = args.reduce(function (records, aip) {
          return records.concat(aip);
        }, []);
        var store = setupTransactionAndStore(db, table, records, resolve, reject);
        records.some(function (record) {
          var req, key;

          if (isObject(record) && hasOwn.call(record, 'item')) {
            key = record.key;
            record = record.item;

            if (key != null) {
              key = mongoifyKey(key); // May throw
            }
          } // These can throw DataError, e.g., if function passed in


          if (key != null) {
            req = store.put(record, key);
          } else {
            req = store.put(record);
          }

          req.onsuccess = function (e) {
            if (!isObject(record)) {
              return;
            }

            var target = e.target;
            var keyPath = target.source.keyPath;

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

    this.put = function () {
      return this.update.apply(this, arguments);
    };

    this.remove = function (table, key) {
      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        key = mongoifyKey(key); // May throw

        var store = setupTransactionAndStore(db, table, key, resolve, reject);
        store["delete"](key); // May throw
      });
    };

    this.del = this["delete"] = function () {
      return this.remove.apply(this, arguments);
    };

    this.clear = function (table) {
      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        var store = setupTransactionAndStore(db, table, undefined, resolve, reject);
        store.clear();
      });
    };

    this.close = function () {
      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        closed = true;
        delete dbCache[name][version];
        db.close();
        resolve();
      });
    };

    this.get = function (table, key) {
      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        key = mongoifyKey(key); // May throw

        var store = setupTransactionAndStore(db, table, undefined, resolve, reject, true);
        var req = store.get(key);

        req.onsuccess = function (e) {
          return resolve(e.target.result);
        };
      });
    };

    this.count = function (table, key) {
      return new Promise(function (resolve, reject) {
        if (closed) {
          reject(new Error('Database has been closed'));
          return;
        }

        key = mongoifyKey(key); // May throw

        var store = setupTransactionAndStore(db, table, undefined, resolve, reject, true);
        var req = key == null ? store.count() : store.count(key); // May throw

        req.onsuccess = function (e) {
          return resolve(e.target.result);
        };
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

    var err;
    Array.from(db.objectStoreNames).some(function (storeName) {
      if (_this2[storeName]) {
        err = new Error('The store name, "' + storeName + '", which you have attempted to load, conflicts with db.js method names."');

        _this2.close();

        return true;
      }

      _this2[storeName] = {};
      var keys = Object.keys(_this2);
      keys.filter(function (key) {
        return ![].concat(serverEvents, ['close', 'batch', 'addEventListener', 'removeEventListener']).includes(key);
      }).map(function (key) {
        _this2[storeName][key] = function () {
          for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
            args[_key3] = arguments[_key3];
          }

          return _this2[key].apply(_this2, [storeName].concat(args));
        };
      });
    });
    return err;
  };

  var _open = function open(db, server, version, noServerMethods) {
    dbCache[server][version] = db;
    return new Server(db, server, version, noServerMethods);
  };

  var db = {
    version: '0.15.0',
    open: function open(options) {
      var server = options.server;
      var noServerMethods = options.noServerMethods;
      var clearUnusedStores = options.clearUnusedStores !== false;
      var clearUnusedIndexes = options.clearUnusedIndexes !== false;
      var version = options.version || 1;
      var schema = options.schema;
      var schemas = options.schemas;
      var schemaType = options.schemaType || (schema ? 'whole' : 'mixed');

      if (!dbCache[server]) {
        dbCache[server] = {};
      }

      var openDb = function openDb(db) {
        var s = _open(db, server, version, noServerMethods);

        if (s instanceof Error) {
          throw s;
        }

        return s;
      };

      return new Promise(function (resolve, reject) {
        if (dbCache[server][version]) {
          var s = _open(dbCache[server][version], server, version, noServerMethods);

          if (s instanceof Error) {
            reject(s);
            return;
          }

          resolve(s);
          return;
        }

        var idbimport = new _idbImport2["default"]();
        var p = Promise.resolve();

        if (schema || schemas || options.schemaBuilder) {
          var _addCallback = idbimport.addCallback;

          idbimport.addCallback = function (cb) {
            function newCb(db) {
              var s = _open(db, server, version, noServerMethods);

              if (s instanceof Error) {
                throw s;
              }

              return cb(db, s);
            }

            return _addCallback.call(idbimport, newCb);
          };

          p = p.then(function () {
            if (options.schemaBuilder) {
              return options.schemaBuilder(idbimport);
            }
          }).then(function () {
            if (schema) {
              switch (schemaType) {
                case 'mixed':
                case 'idb-schema':
                case 'merge':
                case 'whole':
                  {
                    schemas = _defineProperty({}, version, schema);
                    break;
                  }
              }
            }

            if (schemas) {
              idbimport.createVersionedSchema(schemas, schemaType, clearUnusedStores, clearUnusedIndexes);
            }

            var idbschemaVersion = idbimport.version();

            if (options.version && idbschemaVersion < version) {
              throw new Error('Your highest schema building (IDBSchema) version (' + idbschemaVersion + ') ' + 'must not be less than your designated version (' + version + ').');
            }

            if (!options.version && idbschemaVersion > version) {
              version = idbschemaVersion;
            }
          });
        }

        p.then(function () {
          return idbimport.open(server, version);
        })["catch"](function (err) {
          if (err.resume) {
            err.resume = err.resume.then(openDb);
          }

          if (err.retry) {
            var _retry = err.retry;

            err.retry = function () {
              _retry.call(err).then(openDb);
            };
          }

          throw err;
        }).then(openDb).then(resolve)["catch"](function (e) {
          reject(e);
        });
      });
    },
    del: function del(dbName) {
      return this["delete"](dbName);
    },
    "delete": function _delete(dbName) {
      return new Promise(function (resolve, reject) {
        var request = indexedDB.deleteDatabase(dbName); // Does not throw

        request.onsuccess = function (e) {
          // The following is needed currently by PhantomJS (though we cannot polyfill `oldVersion`): https://github.com/ariya/phantomjs/issues/14141
          if (!('newVersion' in e)) {
            e.newVersion = null;
          }

          resolve(e);
        };

        request.onerror = function (e) {
          // No errors currently
          e.preventDefault();
          reject(e);
        };

        request.onblocked = function (e) {
          // The following addresses part of https://bugzilla.mozilla.org/show_bug.cgi?id=1220279
          e = e.newVersion === null || typeof Proxy === 'undefined' ? e : new Proxy(e, {
            get: function get(target, name) {
              return name === 'newVersion' ? null : target[name];
            }
          });
          var resume = new Promise(function (res, rej) {
            // We overwrite handlers rather than make a new
            //   delete() since the original request is still
            //   open and its onsuccess will still fire if
            //   the user unblocks by closing the blocking
            //   connection
            request.onsuccess = function (ev) {
              // The following are needed currently by PhantomJS: https://github.com/ariya/phantomjs/issues/14141
              if (!('newVersion' in ev)) {
                ev.newVersion = e.newVersion;
              }

              if (!('oldVersion' in ev)) {
                ev.oldVersion = e.oldVersion;
              }

              res(ev);
            };

            request.onerror = function (e) {
              e.preventDefault();
              rej(e);
            };
          });
          e.resume = resume;
          reject(e);
        };
      });
    },
    cmp: function cmp(param1, param2) {
      return new Promise(function (resolve, reject) {
        resolve(indexedDB.cmp(param1, param2)); // May throw
      });
    },
    rangeIncludes: function rangeIncludes(range, key) {
      return new Promise(function (resolve, reject) {
        range = mongoifyKey(range); // May throw

        if (!range || _typeof(range) !== 'object') {
          reject(new TypeError('Bad range supplied'));
          return;
        }

        key = mongoifyKey(key); // May throw

        resolve(range.includes(key));
      });
    }
  };

  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = db;
  } else if (typeof define === 'function' && define.amd) {
    define(function () {
      return db;
    });
  } else {
    local.db = db;
  }
})(self);
//# sourceMappingURL=db.js.map
