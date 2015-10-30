/*global window, console, document, alert */
/*jslint vars:true*/
/*eslint no-magic-numbers: 0, no-alert: 0*/
/* jscs:disable maximumLineLength */
(function (db, describe, it, expect) {
    'use strict';

    describe('server handlers', function () {
        var dbName = 'tests',
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
                    specialID: {}
                }
            }
        };

        // Instead of beforeEach/afterEach, we use a function for boilerplate
        //  to avoid IndexedDB's issues with setting db as a global
        function setUp (cb) {
            indexedDB.deleteDatabase(dbName); // Ensure we delete if there is a problem
            var spec = {};
            function takeDown (finishedCb) {
                if (spec.server && !spec.server.closed) {document.body.innerHTML += 'still-not-closed\n';
                    spec.server.close();
                }

                var req = indexedDB.deleteDatabase(dbName);

                req.onsuccess = function () {document.body.innerHTML += 'afterEach-success\n';
                    finishedCb();
                };

                req.onerror = function () {document.body.innerHTML += 'afterEach-error\n';
                    console.log('failed to delete db in afterEach',
                                  arguments, spec);
                    finishedCb('error');
                };

                req.onblocked = function () {document.body.innerHTML += 'afterEach-blocked\n';
                    console.log('db blocked', arguments);
                    finishedCb('blocked1');
                };
            }
            if (spec.server && !spec.server.closed) {
                spec.server.close();
            }

            var req = indexedDB.deleteDatabase(dbName);
            req.onsuccess = function () {document.body.innerHTML += 'beforeEach-success\n';
                db.open({
                    server: dbName,
                    version: 1,
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
                        spec.item2, spec.item3).then(function () {document.body.innerHTML += 'beforeEach-done\n';
                            cb(spec, takeDown);
                        }
                    );
                });
            };

            req.onerror = function () {document.body.innerHTML += 'beforeEach-error\n';
                console.log('failed to delete db in beforeEach', arguments);
            };

            req.onblocked = function () {document.body.innerHTML += 'beforeEach-blocked\n';
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

                spec.server.test.onversionchange(function (vce) {document.body.innerHTML += 'versionchange\n';
                    expect(vce.newVersion).toEqual(newVersion);
                    spec.server.close(); // Will otherwise cause a blocked event
                });
                db.open({
                    server: dbName,
                    version: newVersion,
                    schema: schema
                }).then(function (dbr) {document.body.innerHTML += 'then-good\n';
                    if (!dbr.closed) {
                        dbr.close();
                    }
                    takeDown(done);
                });
            });
        });

        return;

        // Can't seem to get these to be handled or recover
        it('should receive onerror events', function (done) {
            setUp(function (spec, takeDown) {
                var badVersion = 0;

                spec.server.test.onerror(function (vce) {document.body.innerHTML += '1onerror\n';
                    expect(vce.newVersion).toEqual(badVersion);
                    spec.server.close(); // Will otherwise cause a blocked event
                    takeDown(done);
                });
                var tx = spec.server.db.transaction('test');
                tx.delete();
            });
        });

        // jscs:disable requireCapitalizedComments
        // jasmine.DEFAULT_TIMEOUT_INTERVAL = 15000;
        it('should receive blocked events (on db open)', function (done) {
            setUp(function (spec, takeDown) {
                var newVersion = 11;
                schema.changed = schema.test;

                db.open({
                    server: dbName,
                    version: newVersion,
                    schema: schema
                }).then(null, function (err) {document.body.innerHTML += 'then-error\n';
                    // Returns the attempted version, but as an error
                    expect(err.newVersion).toEqual(newVersion);
                    if (!spec.server.closed) {document.body.innerHTML += 'not-closed\n';
                        spec.server.close();
                    }
                    takeDown(done);
                });
            });
        });

        /* jscs:disable
        it('should receive blocked events (on database delete)', function (done) {

        });
        it('should receive error events', function (done) {
            var spec = this;
            spec.server.test.onerror(function (err) {
                alert(err.name);
                done();
            }).query().all().execute();
            db.open({
                server: dbName,
                version: 0,
                schema: schema
            }).then(function (data) {
                done();
            });
        });
        it('should receive abort events', function (done) {
            this.server.onabort(function () {
                done();
            });
        });
        */
    });
}(window.db, window.describe, window.it, window.expect));
