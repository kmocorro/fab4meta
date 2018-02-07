let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let Promise = require('bluebird');
let bodyParser = require('body-parser');
let moment = require('moment');
let fs = require('fs');

module.exports = function(app){

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    
    function process_list() { // full process list
        return new Promise(function(resolve, reject){

            mysqlCloud.poolCloud.getConnection(function(err, connection){
                connection.query({
                    sql: 'SELECT process FROM tbl_process_list'
                }, function(err, results, fields){
                    let full_process_list_obj = [];

                        for(let i=0; i< results.length; i++){
                            full_process_list_obj.push({
                                process: results[i].process
                            });
                        }
                    
                    resolve(full_process_list_obj);
                    
                });
                connection.release();
            });

        });
    }

    app.get('/favicon.ico', function(req, res) { // preventing request for favicon
        res.status(204);
    });

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
        let access_details = [];
        let log_stream = fs.createWriteStream('./././public/logs/access_logs.txt', {flags: 'a'});

        // ** log client ip * //
        access_details.push(
            moment(new Date()).format() + ',' + req.ip + ',' + process_param 
        );

        for(let i=0; i<access_details.length;i++){
            log_stream.write(access_details[i] + '\n');
        }
        log_stream.end();
        // ** log end * //
        
        // check params authentication link
        if(!process_param){

            res.render('404');

        } else {

            function checkProcess() {
                return new Promise(function(resolve, reject){

                    mysqlCloud.poolCloud.getConnection(function(err, connection){
                        connection.query({
                            sql: 'SELECT process FROM tbl_process_list WHERE process = ?',
                            values: [process_param]
                        }, function(err, results, fields){

                            if(typeof results[0] == 'undefined'){
                                res.render('404');
                            } else {

                                resolve(results);
                            }

                        });
                        connection.release();
                    });

                });
            }

            checkProcess().then(function(results){
                return process_list().then(function(full_process_list_obj){
                        
                    let process_list_obj = [];
                        
                    process_list_obj.push({
                        process: results[0].process
                    });
                    
                    if(process_list_obj[0].process == 'POLY' || process_list_obj[0].process == 'NDEP' || process_list_obj[0].process == 'PDRIVE'  || process_list_obj[0].process == 'TEST'){

                        res.render('underconstruction');

                    } else {

                        res.render('realtime', {process : process_list_obj[0].process, process_list: full_process_list_obj});

                    }
                    
                  

                });
            });
        }

    });

    app.get('/', function(req, res){

        process_list().then(function(full_process_list_obj){

            res.render('index', {process_list: full_process_list_obj});

        });

    });

}