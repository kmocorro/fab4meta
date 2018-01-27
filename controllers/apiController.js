let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let Promise = require('bluebird');
let bodyParser = require('body-parser');

module.exports = function(app){

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    app.get('/', function(req, res){
        res.render('index');
    });

}