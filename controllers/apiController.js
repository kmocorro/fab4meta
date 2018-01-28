let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let Promise = require('bluebird');
let bodyParser = require('body-parser');

module.exports = function(app){

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get('/manufacturing', function(req, res){
        res.render('manufacturing');
    });

    app.get('/engineering', function(req, res){
        res.render('engineering');
    });

    app.get('/yield', function(req, res){
        res.render('yield');
    });

    app.get('/:process', function(req, res){
        let process_param = req.params.process;
        res.render('realtime', {process: process_param});
    });

    app.get('/', function(req, res){
        res.render('index');
    });

}