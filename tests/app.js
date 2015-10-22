/*global require, module, __dirname, console, process*/
/*eslint no-process-env: 0*/
var express = require('express');
var app = module.exports = express();
var fs = require('fs');
var path = require('path');

(function () {'use strict';

    app.set('views', path.join(__dirname, 'views'));
    app.use('/lib', express.static(path.join(__dirname, 'lib')));
    app.use('/specs', express.static(path.join(__dirname, 'specs')));
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);

    app.configure('development', function () {
        app.use(express.errorHandler({dumpExceptions: true, showStack: true}));
    });
    app.configure('production', function () {
        app.use(express.errorHandler());
    });

    app.get('/foo', function (req, res) {
        res.json({
            firstName: 'John',
            lastName: 'Smith'
        });
    });

    app.get('/', function (req, res) {
        res.render('index');
    });

    var statusOk = 200;
    app.get('/src/db.js', function (req, res) {
        fs.readFile(path.join(__dirname, '/../src/db.js'), function (err, data) {
            if (err) {
                console.log("error reading file");
                return;
            }
            res.type('application/javascript');
            res.send(statusOk, data);
        });
    });

    var defaultPort = 3000;
    app.listen(process.env.PORT || defaultPort);

}());
