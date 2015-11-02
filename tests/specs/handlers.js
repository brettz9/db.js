/*global window, console */
/*jslint vars:true*/
/*eslint no-magic-numbers: 0, no-alert: 0*/
/* jscs:disable maximumLineLength */
(function (db, describe, it, expect) {
    'use strict';

    describe('handlers', function () {
        var dbName = 'tests',
            initialVersion = 2,
            indexedDB = window.indexedDB || window.webkitIndexedDB ||
            window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

        var schema = {
            test: {
                key: {
                    keyPath: 'id',
                    autoIncrement: true
                },
                indexes: {
                    firstName: {},
                    age: {},
                    specialID: {unique: true}
                }
            }
        };

        // Instead of beforeEach/afterEach, we use a function for boilerplate
        //  to avoid IndexedDB's issues with setting db as a global
        function setUp (cb) {
            indexedDB.deleteDatabase(dbName); // Ensure we delete if there is a problem
            var spec = {};
            function takeDown (finishedCb) {
                if (spec.server && !spec.server.closed) {
                    spec.server.close();
                }

                var req = indexedDB.deleteDatabase(dbName);

                req.onsuccess = function () {
                    finishedCb();
                };

                req.onerror = function () {
                    console.log('failed to delete db in afterEach',
                                  arguments, spec);
                    finishedCb('error');
                };

                req.onblocked = function () {
                    console.log('db blocked', arguments);
                    finishedCb('blocked1');
                };
            }
            if (spec.server && !spec.server.closed) {
                spec.server.close();
            }

            var req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = function () {
                db.open({
                    server: dbName,
                    version: initialVersion,
                    schema: schema
                }).then(function (s) {
                    spec.server = s;
                }).then(function () {
                    spec.item1 = {
                        firstName: 'Aaron',
                        lastName: 'Powell',
                        age: 20
                    };
                    spec.item2 = {
                        firstName: 'John',
                        lastName: 'Smith',
                        age: 30
                    };
                    spec.item3 = {
                        firstName: 'Aaron',
                        lastName: 'Jones',
                        age: 40,
                        specialID: 5
                    };
                    spec.server.add('test', spec.item1,
                        spec.item2, spec.item3).then(function () {
                            cb(spec, takeDown);
                        }
                    );
                });
            };

            req.onerror = function () {
                console.log('failed to delete db in beforeEach', arguments);
            };

            req.onblocked = function () {
                console.log('db blocked', arguments, spec);
            };
        }

        it('should receive onabort events', function (done) {
            setUp(function (spec, takeDown) {
                spec.server.test.onabort(function (vce) {
                    expect(vce.target.error).toEqual(null);
                    takeDown(done);
                });
                var tx = spec.server.db.transaction('test');
                tx.abort();
            });
        });

        it('should receive versionchange events', function (done) {
            setUp(function (spec, takeDown) {
                var newVersion = 10;

                spec.server.test.onversionchange(function (vce) {
                    expect(vce.newVersion).toEqual(newVersion);
                    spec.server.close(); // Will otherwise cause a blocked event
                });
                db.open({
                    server: dbName,
                    version: newVersion,
                    schema: schema
                }).then(function (dbr) {
                    if (!dbr.closed) {
                        dbr.close();
                    }
                    takeDown(done);
                });
            });
        });

        it('should receive blocked events (on db open)', function (done) {
            setUp(function (spec, takeDown) {
                var newVersion = 11;
                schema.changed = schema.test;

                db.open({
                    server: dbName,
                    version: newVersion,
                    schema: schema
                }).catch(function (e) {
                    expect(e.oldVersion).toEqual(initialVersion);
                    expect(e.newVersion).toEqual(newVersion);
                    expect(e.type).toEqual('blocked');
                    if (!spec.server.closed) {
                        spec.server.close();
                        return e.resume;
                    }
                    throw e; // Shouldn't get here
                }).then(function (s) {
                    s.close(); // Close this connection too to avoid blocking next set of tests
                    takeDown(done);
                });
            });
        });

        it('should receive blocked events (on database delete)', function (done) {
            setUp(function (spec, takeDown) {
                db.delete(dbName).then(null, function (err) {
                    expect(err.oldVersion).toEqual(initialVersion);
                    expect(err.newVersion).toEqual(null);
                    if (!spec.server.closed) {
                        spec.server.close();
                    }
                    takeDown(done);
                });
            });
        });

        it('should receive IDBDatabase onerror events', function (done) {
            setUp(function (spec, takeDown) {
                var badVersion = 1;
                db.open({
                    server: dbName,
                    version: badVersion,
                    schema: schema
                }).catch(function (err) {
                    expect(err.oldVersion).toBe(undefined);
                    expect(err.newVersion).toBe(undefined);
                    expect(err.type).toBe('error');
                    takeDown(done);
                });
            });
        });

        it('should receive IDBRequest onerror events', function (done) {
            setUp(function (spec, takeDown) {
                spec.server.test.onerror(function (vce) {
                    expect(vce.type).toBe('error');
                    takeDown(done);
                });

                // Todo: Test error handlers of equivalent db.js methods

                var tx = spec.server.db.transaction('test', 'readwrite');
                tx.onerror = function (err) {
                    expect(err.type).toBe('error');
                };
                var store = tx.objectStore('test');
                var request = store.add({specialID: 5});
                request.onerror = function (err) {
                    expect(err.type).toBe('error');
                };
            });
        });
    });
}(new window.DbJs(), window.describe, window.it, window.expect));
