/*global window, guid*/
(function (db, describe, it, expect, beforeEach, afterEach) {
    'use strict';
    describe('schema-builder', function () {
        this.timeout(5000);
        var indexedDB = window.indexedDB || window.webkitIndexedDB ||
            window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

        beforeEach(function (done) {
            this.dbName = guid();
            done();
        });

        afterEach(function () {
            if (this.server && !this.server.isClosed()) {
                this.server.close();
            }
            this.server = undefined;

            indexedDB.deleteDatabase(this.dbName);
        });

        it('should let schemaBuilder modify stores, indexes, and add callback (to modify content) by incremental versions', function (done) {
            var spec = this;
            function v1to3 (idbs) {
                idbs.version(1)
                  .addStore('books', { keyPath: 'isbn' })
                  .addIndex('byTitle', 'title', { unique: true })
                  .addIndex('byAuthor', 'author')
                .version(2)
                  .getStore('books')
                  .addIndex('byDate', ['year', 'month'])
                .version(3)
                  .addStore('magazines')
                  .addIndex('byPublisher', 'publisher')
                  .addIndex('byFrequency', 'frequency');
            }
            function v1to4 (idbs) {
                v1to3(idbs);
                idbs.version(4)
                    .getStore('magazines')
                    .delIndex('byPublisher')
                    .addCallback(function (e, s) {
                        s.books.query('byTitle').all().modify({
                            textISBN: function (record) {
                                return 'My ISBN: ' + (record.isbn || '(none)');
                            }
                        }).execute();
                    });
            }
            var gotISBN = false;
            db.open({server: this.dbName, schemaBuilder: v1to3}).then(function (s3) {
                return s3.books.add({title: 'A Long Time Ago', isbn: '1234567890'}).then(function (result) {
                    s3.close();
                    return db.open({server: spec.dbName, schemaBuilder: v1to4, version: 4});
                }).then(function (s4) {
                    s4.books.get('1234567890').then(function (record) {
                        gotISBN = true;
                        expect(record.textISBN).to.equal('My ISBN: 1234567890');
                        return s4.magazines.query('byPublisher').all().execute();
                    }).catch(function (errorFromNowMissingIndex) {
                        expect(gotISBN).to.equal(true);
                        expect(errorFromNowMissingIndex.name).to.equal('NotFoundError');
                        s4.close();
                        done();
                    });
                });
            });
        });
    });
}(window.db, window.describe, window.it, window.expect, window.beforeEach, window.afterEach));
