/*global window, guid*/
(function (db, describe, it, expect, beforeEach, afterEach) {
    'use strict';
    var key1, key2;
    describe('db.cmp', function () {
        this.timeout(5000);
        var indexedDB = window.indexedDB || window.webkitIndexedDB ||
            window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

        beforeEach(function (done) {
            this.dbName = guid();

            var req = indexedDB.open(this.dbName);
            req.onsuccess = function () {
                req.result.close();
            };
            req.onupgradeneeded = function () {
                var objStore = req.result.createObjectStore('names', {autoIncrement: true});
                var person1 = {name: 'Alex'};
                var person2 = {name: 'Mia'};

                var addReq1 = objStore.add(person1);
                addReq1.onsuccess = function (e) {
                    key1 = e.target.result;
                    var addReq2 = objStore.add(person2);
                    addReq2.onsuccess = function (e2) {
                        key2 = e2.target.result;
                        done();
                    };
                };
            };
            req.onblocked = function (e) {
                done(e);
            };
        });

        afterEach(function (done) {
            if (this.server && !this.server.isClosed()) {
                this.server.close();
            }
            this.server = undefined;

            var req = indexedDB.deleteDatabase(this.dbName);

            req.onsuccess = function () {
                done();
            };
            req.onerror = function (e) {
                console.log('failed to delete db', arguments);
            };
            req.onblocked = function (e) {
                console.log('db blocked', arguments);
            };
        });

        it('db.cmp should return 1, -1, or 0 as expected for key comparions', function (done) {
            db.cmp(key1, key2).then(function (cmp) {
                expect(cmp).to.equal(-1);
                return db.cmp(key2, key2);
            }).then(function (cmp) {
                expect(cmp).to.equal(0);
                return db.cmp(key2, key1);
            }).then(function (cmp) {
                expect(cmp).to.equal(1);
                done();
            });
        });
    });
    describe('db.rangeIncludes', function () {
        it('should catch errors', function () {
            var caught = 0;
            return db.rangeIncludes(null, IDBKeyRange.only(1)).catch(function (err) {
                caught++;
                expect(err.name).to.equal('TypeError');
                return db.rangeIncludes(IDBKeyRange.only(1), null);
            }).catch(function (err) {
                caught++;
                expect(err.name).to.equal('DataError');
                return db.rangeIncludes({gte: 0, lte: 7}, {gte: 1, lte: 5});
            }).catch(function (err) {
                expect(err.name).to.equal('DataError');
                expect(caught).to.equal(2);
            });
        });
        it('should get successful results', function () {
            return db.rangeIncludes({gte: 1}, 1).then(function (result) {
                expect(result).to.equal(true);
                return db.rangeIncludes({gte: 2}, 1);
            }).then(function (result) {
                expect(result).to.equal(false);
                return db.rangeIncludes(IDBKeyRange.lowerBound(3), 4);
            }).then(function (result) {
                expect(result).to.equal(true);
                return db.rangeIncludes(IDBKeyRange.lowerBound(4), 3);
            }).then(function (result) {
                expect(result).to.equal(false);
            });
        });
    });
}(window.db, window.describe, window.it, window.expect, window.beforeEach, window.afterEach));
