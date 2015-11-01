/*global window*/
(function (db, describe, it, expect, beforeEach /*, afterEach */) {
    'use strict';
    var key1, key2;
    describe('db.delete', function () {
        var dbName = 'tests',
            indexedDB = window.indexedDB || window.webkitIndexedDB ||
            window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

        beforeEach(function (done) {
            var request = indexedDB.deleteDatabase(dbName);

            request.onsuccess = function () {
                var req = indexedDB.open(dbName);
                req.onupgradeneeded = function () {
                    var objStore = req.result.createObjectStore(
                        'names', {autoIncrement: true}
                    );
                    var person1 = {name: 'Alex'};
                    var person2 = {name: 'Mia'};

                    var addReq1 = objStore.add(person1);
                    addReq1.onsuccess = function (e) {
                        key1 = e.target.result;
                        var addReq2 = objStore.add(person2);
                        addReq2.onsuccess = function (e2) {
                            key2 = e2.target.result;
                            req.result.close();
                            var second = 0;
                            // Chrome is not closing immediately
                            window.setTimeout(function () {
                                done();
                            }, second);
                        };
                    };
                };
            };
            request.onerror = function (e) {
                done(e);
            };
        });
        it('should delete a created db', function (done) {
            db.delete(dbName).then(function () {
                var request = indexedDB.open(dbName);
                request.onupgradeneeded = function (e) {
                    expect(e.oldVersion).toEqual(0);
                    e.target.transaction.abort();
                    done();
                };
            });
        });
        it('db.cmp should return 1, -1, or 0 as expected for key comparions',
            function (done) {
                var cmp = db.cmp(key1, key2);
                expect(cmp).toEqual(-1);
                cmp = db.cmp(key2, key2);
                expect(cmp).toEqual(0);
                cmp = db.cmp(key2, key1);
                expect(cmp).toEqual(1);
                done();
            }
        );
    });
}(window.db, window.describe, window.it, window.expect,
  window.beforeEach, window.afterEach));
