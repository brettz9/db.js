/*global window, console*/
/*jslint vars:true*/
/*eslint no-magic-numbers: 0*/
(function (db, describe, it, expect, beforeEach, afterEach) {
    'use strict';

    describe('server.properties', function () {
        var dbName = 'tests', version = 1,
            indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

        beforeEach(function (done) {
            var spec = this;

            spec.server = undefined;

            var req = indexedDB.deleteDatabase(dbName);

            req.onsuccess = function () {
                db.open({
                    server: dbName,
                    version: version,
                    schema: {
                        test: {
                            key: {
                                keyPath: 'id',
                                autoIncrement: true
                            }
                        }
                    }
                }).then(function (s) {
                    spec.server = s;
                    expect(spec.server).toBeDefined();
                    done();
                });
            };

            req.onerror = function () {
                console.log('failed to delete db', arguments);
            };

            req.onblocked = function () {
                console.log('db blocked', arguments, spec);
            };
        });

        afterEach(function (done) {
            if (this.server) {
                this.server.close();
            }
            var req = indexedDB.deleteDatabase(dbName);

            req.onsuccess = function () {
                done();
            };

            req.onerror = function () {
                console.log('failed to delete db', arguments);
            };

            req.onblocked = function () {
                console.log('db blocked', arguments);
            };
        });

        it('should return the database name', function (done) {
            expect(this.server.name).toEqual(dbName);
            done();
        });
        it('should return the database version', function (done) {
            expect(this.server.version).toEqual(version);
            done();
        });
        it('should return the objectStoreNames', function (done) {
            var objectStoreNames = this.server.objectStoreNames;
            expect(objectStoreNames.length).toEqual(1);
            expect(objectStoreNames[0]).toEqual('test');
            done();
        });
    });

}(window.db, window.describe, window.it, window.expect, window.beforeEach, window.afterEach));
