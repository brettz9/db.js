/*global require, module, __dirname, console, process*/
/*eslint no-process-env: 0*/
var express = require('express');
var app = module.exports = express();
var fs = require('fs');
var path = require('path');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');

(function () {'use strict';
    app.set('views', path.join(__dirname, 'views'));
    app.use('/bower', express.static(path.join(__dirname, '../bower')));
    app.use('/specs', express.static(path.join(__dirname, 'specs')));
    app.set('view engine', 'jade');
    app.use('/foo', bodyParser.json());
    app.use('/', bodyParser.text({type: 'text/html'}));

    var env = process.env.NODE_ENV || 'development';
    if (env === 'development') {
        app.use(errorHandler({dumpExceptions: true, showStack: true}));
    }

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
            res.status(statusOk).send(data);
        });
    });

    var defaultPort = 3000;
    app.listen(process.env.PORT || defaultPort);

}());
