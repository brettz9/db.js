"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = undefined;

var _idbSchema = require("idb-schema");

var _idbSchema2 = _interopRequireDefault(_idbSchema);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { if (!(Symbol.iterator in Object(arr) || Object.prototype.toString.call(arr) === "[object Arguments]")) { return; } var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); if (superClass) _setPrototypeOf(subClass, superClass); }

function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }

/*
# Notes

1. Could use/adapt [jtlt](https://github.com/brettz9/jtlt/) for changing JSON data

# Possible to-dos

1. Support data within adapted JSON Merge Patch
1. Allow JSON Schema to be specified during import (and export): https://github.com/aaronpowell/db.js/issues/181
1. JSON format above database level to allow for deleting or moving/copying of whole databases
1. `copyFrom`/`moveFrom` for indexes
*/
self._babelPolyfill = false; // Need by Phantom in avoiding duplicate babel polyfill error
// eslint-disable-next-line import/first

var stringify = JSON.stringify;

var hasOwn = function hasOwn(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
};

var compareStringified = function compareStringified(a, b) {
  return stringify(a) === stringify(b);
};

var IdbImport =
/*#__PURE__*/
function (_IdbSchema) {
  _inherits(IdbImport, _IdbSchema);

  function IdbImport() {
    _classCallCheck(this, IdbImport);

    return _possibleConstructorReturn(this, _getPrototypeOf(IdbImport).apply(this, arguments));
  }

  _createClass(IdbImport, [{
    key: "_setup",
    value: function _setup(schema, cb, mergePatch) {
      var _this = this;

      var isNUL = schema === '\0';

      if (!schema || _typeof(schema) !== 'object' && !(mergePatch && isNUL)) {
        throw new Error('Bad schema object');
      }

      this.addEarlyCallback(function (e) {
        var db = e.target.result;
        var transaction = e.target.transaction;

        if (mergePatch && isNUL) {
          _this._deleteAllUnused(db, transaction, {}, true);

          return;
        }

        return cb(e, db, transaction);
      });
    }
  }, {
    key: "_deleteIndexes",
    value: function _deleteIndexes(transaction, storeName, exceptionIndexes) {
      var _this2 = this;

      var store = transaction.objectStore(storeName); // Shouldn't throw

      Array.from(store.indexNames).forEach(function (indexName) {
        if (!exceptionIndexes || !hasOwn(exceptionIndexes, indexName)) {
          _this2.delIndex(indexName);
        }
      });
    }
  }, {
    key: "_deleteAllUnused",
    value: function _deleteAllUnused(db, transaction, schema, clearUnusedStores, clearUnusedIndexes) {
      var _this3 = this;

      if (clearUnusedStores || clearUnusedIndexes) {
        Array.from(db.objectStoreNames).forEach(function (storeName) {
          if (clearUnusedStores && !hasOwn(schema, storeName)) {
            // Errors for which we are not concerned and why:
            // `InvalidStateError` - We are in the upgrade transaction.
            // `TransactionInactiveError` (as by the upgrade having already
            //      completed or somehow aborting) - since we've just started and
            //      should be without risk in this loop
            // `NotFoundError` - since we are iterating the dynamically updated
            //      `objectStoreNames`
            // this._versions[version].dropStores.push({name: storeName});
            // Avoid deleting if going to delete in a move/copy
            if (!Object.keys(schema).some(function (key) {
              return [schema[key].moveFrom, schema[key].copyFrom].includes(storeName);
            })) {
              _this3.delStore(storeName); // Shouldn't throw // Keep this and delete previous line if this PR is accepted: https://github.com/treojs/idb-schema/pull/14

            }
          } else if (clearUnusedIndexes) {
            _this3._deleteIndexes(transaction, storeName, schema[storeName].indexes);
          }
        });
      }
    }
  }, {
    key: "_createStoreIfNotSame",
    value: function _createStoreIfNotSame(db, transaction, schema, storeName, mergePatch) {
      var newStore = schema[storeName];
      var store;
      var storeParams = {};

      function setCanonicalProps(storeProp) {
        var canonicalPropValue;

        if (hasOwn(newStore, 'key')) {
          // Support old approach of db.js
          canonicalPropValue = newStore.key[storeProp];
        } else if (hasOwn(newStore, storeProp)) {
          canonicalPropValue = newStore[storeProp];
        } else {
          canonicalPropValue = storeProp === 'keyPath' ? null : false;
        }

        if (mergePatch && typeof canonicalPropValue === 'string') {
          if (canonicalPropValue === '\0') {
            canonicalPropValue = storeProp === 'keyPath' ? null : false;
          } else {
            canonicalPropValue = canonicalPropValue.replace(/^\0/, ''); // Remove escape if present
          }
        }

        storeParams[storeProp] = canonicalPropValue;
      }

      var copyFrom = newStore.copyFrom;
      var moveFrom = newStore.moveFrom;

      try {
        ['keyPath', 'autoIncrement'].forEach(setCanonicalProps);

        if (!db.objectStoreNames.contains(storeName)) {
          throw new Error('goto catch to build store');
        }

        store = transaction.objectStore(storeName); // Shouldn't throw

        this.getStore(store);

        if (!['keyPath', 'autoIncrement'].every(function (storeProp) {
          return compareStringified(storeParams[storeProp], store[storeProp]);
        })) {
          // Avoid deleting if going to delete in a move/copy
          if (!copyFrom && !moveFrom) this.delStore(storeName);
          throw new Error('goto catch to build store');
        }
      } catch (err) {
        if (err.message !== 'goto catch to build store') {
          throw err;
        }

        if (copyFrom) {
          this.copyStore(copyFrom, storeName, storeParams); // May throw
        } else if (moveFrom) {
          this.renameStore(moveFrom, storeName, storeParams); // May throw
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
          // `SyntaxError` - if an invalid `storeParams.keyPath` is supplied.
          // `InvalidAccessError` - if `storeParams.autoIncrement` is `true` and `storeParams.keyPath` is an
          //      empty string or any sequence (empty or otherwise).
          this.addStore(storeName, storeParams); // May throw
        }
      }

      return [store, newStore];
    }
  }, {
    key: "_createIndex",
    value: function _createIndex(store, indexes, indexName, mergePatch) {
      var newIndex = indexes[indexName];
      var indexParams = {};

      function setCanonicalProps(indexProp) {
        var canonicalPropValue;

        if (hasOwn(newIndex, indexProp)) {
          canonicalPropValue = newIndex[indexProp];
        } else {
          canonicalPropValue = indexProp === 'keyPath' ? null : false;
        }

        if (mergePatch && typeof canonicalPropValue === 'string') {
          if (canonicalPropValue === '\0') {
            canonicalPropValue = indexProp === 'keyPath' ? null : false;
          } else {
            canonicalPropValue = canonicalPropValue.replace(/^\0/, ''); // Remove escape if present
          }
        }

        indexParams[indexProp] = canonicalPropValue;
      }

      try {
        ['keyPath', 'unique', 'multiEntry', 'locale'].forEach(setCanonicalProps);

        if (!store || !store.indexNames.contains(indexName)) {
          throw new Error('goto catch to build index');
        }

        var oldIndex = store.index(indexName);

        if (!['keyPath', 'unique', 'multiEntry', 'locale'].every(function (indexProp) {
          return compareStringified(indexParams[indexProp], oldIndex[indexProp]);
        })) {
          this.delIndex(indexName);
          throw new Error('goto catch to build index');
        }
      } catch (err) {
        if (err.message !== 'goto catch to build index') {
          throw err;
        } // Errors for which we are not concerned and why:
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


        this.addIndex(indexName, indexParams.keyPath !== null ? indexParams.keyPath : indexName, indexParams);
      }
    }
  }, {
    key: "createIdbSchemaPatchSchema",
    value: function createIdbSchemaPatchSchema(schema) {
      schema(this); // May throw
    } // Modified JSON Merge Patch type schemas: https://github.com/json-schema-org/json-schema-spec/issues/15#issuecomment-211142145

  }, {
    key: "createMergePatchSchema",
    value: function createMergePatchSchema(schema) {
      var _this4 = this;

      this._setup(schema, function (e, db, transaction) {
        Object.keys(schema).forEach(function (storeName) {
          var schemaObj = schema[storeName];
          var isNUL = schemaObj === '\0';

          if (isNUL) {
            _this4.delStore(storeName);

            return;
          }

          if (!schemaObj || _typeof(schemaObj) !== 'object') {
            throw new Error('Invalid merge patch schema object (type: ' + _typeof(schemaObj) + '): ' + schemaObj);
          }

          var _this4$_createStoreIf = _this4._createStoreIfNotSame(db, transaction, schema, storeName, true),
              _this4$_createStoreIf2 = _slicedToArray(_this4$_createStoreIf, 1),
              store = _this4$_createStoreIf2[0];

          if (hasOwn(schemaObj, 'indexes')) {
            var indexes = schemaObj.indexes;

            var _isNUL = indexes === '\0';

            if (_isNUL) {
              _this4._deleteIndexes(transaction, storeName);

              return;
            }

            if (!indexes || _typeof(indexes) !== 'object') {
              throw new Error('Invalid merge patch indexes object (type: ' + _typeof(indexes) + '): ' + indexes);
            }

            Object.keys(indexes).forEach(function (indexName) {
              var indexObj = indexes[indexName];
              var isNUL = indexObj === '\0';

              if (isNUL) {
                _this4.delIndex(indexName);

                return;
              }

              if (!indexObj || _typeof(indexObj) !== 'object') {
                throw new Error('Invalid merge patch index object (type: ' + _typeof(indexObj) + '): ' + indexObj);
              }

              _this4._createIndex(store, indexes, indexName, true);
            });
          }
        });
      });
    }
  }, {
    key: "createWholePatchSchema",
    value: function createWholePatchSchema(schema) {
      var _this5 = this;

      var clearUnusedStores = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      var clearUnusedIndexes = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

      this._setup(schema, function (e, db, transaction) {
        _this5._deleteAllUnused(db, transaction, schema, clearUnusedStores, clearUnusedIndexes);

        Object.keys(schema).forEach(function (storeName) {
          var _this5$_createStoreIf = _this5._createStoreIfNotSame(db, transaction, schema, storeName),
              _this5$_createStoreIf2 = _slicedToArray(_this5$_createStoreIf, 2),
              store = _this5$_createStoreIf2[0],
              newStore = _this5$_createStoreIf2[1];

          var indexes = newStore.indexes;
          Object.keys(indexes || {}).forEach(function (indexName) {
            _this5._createIndex(store, indexes, indexName);
          });
        });
      });
    }
  }, {
    key: "createVersionedSchema",
    value: function createVersionedSchema(schemas, schemaType, clearUnusedStores, clearUnusedIndexes) {
      var _this6 = this;

      var createPatches = function createPatches(schemaObj, schemaType) {
        switch (schemaType) {
          case 'mixed':
            {
              schemaObj.forEach(function (mixedObj) {
                var schemaType = Object.keys(mixedObj)[0];
                var schema = mixedObj[schemaType];

                if (schemaType !== 'idb-schema' && schema === 'function') {
                  schema = schema(_this6); // May throw
                } // These could immediately throw with a bad version


                switch (schemaType) {
                  case 'idb-schema':
                    {
                      // Function called above
                      _this6.createIdbSchemaPatchSchema(schema);

                      break;
                    }

                  case 'merge':
                    {
                      _this6.createMergePatchSchema(schema);

                      break;
                    }

                  case 'whole':
                    {
                      _this6.createWholePatchSchema(schema, clearUnusedStores, clearUnusedIndexes);

                      break;
                    }

                  case 'mixed':
                    {
                      createPatches(schema, schemaType);
                      break;
                    }

                  default:
                    throw new Error('Unrecognized schema type');
                }
              });
              break;
            }

          case 'merge':
            {
              _this6.createMergePatchSchema(schemaObj);

              break;
            }

          case 'idb-schema':
            {
              _this6.createIdbSchemaPatchSchema(schemaObj);

              break;
            }

          case 'whole':
            {
              _this6.createWholePatchSchema(schemaObj, clearUnusedStores, clearUnusedIndexes);

              break;
            }
        }
      };

      Object.keys(schemas || {}).sort().forEach(function (schemaVersion) {
        var version = parseInt(schemaVersion, 10);
        var schemaObj = schemas[version];

        if (schemaType !== 'idb-schema' && typeof schemaObj === 'function') {
          schemaObj = schemaObj(_this6); // May throw
        }

        _this6.version(version);

        createPatches(schemaObj, schemaType, version);
      });
    }
  }]);

  return IdbImport;
}(_idbSchema2["default"]);

exports["default"] = IdbImport;
//# sourceMappingURL=idb-import.js.map
