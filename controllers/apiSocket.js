let Promise = require('bluebird');
let bodyParser = require('body-parser');
let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let moment = require('moment');

let mysql = require('mysql');
let connectAuth = require('../dbConfig/config');

module.exports = function(io){

    function authMES(){   // getting details from local db
        return new Promise(function(resolve, reject){
            connectAuth.connectAuth.getConnection(function(err, connection){
                connection.query({
                    sql: 'SELECT * FROM tbl_mes_details;'
                },  function(err, results, fields){
                    let auth_mes_obj = [];
                        for(let i=0; i<results.length;i++){
                            if(results[i].db == 'fab4'){ // DB only for fab4
                                auth_mes_obj.push({
                                    auth_host: results[i].hostname,
                                    auth_user: results[i].user,
                                    auth_password: results[i].pass,
                                    auth_database: results[i].db
                                });
                            }
                        }
                        
                    resolve(auth_mes_obj);
                });
                connection.release();
            });
        });
    }
    
    authMES().then(function(auth_mes_obj){
        let poolMES = mysql.createPool({
            multipleStatements: 1000,
            connectionLimit: 1000,
            host: auth_mes_obj[0].auth_host,
            user:   auth_mes_obj[0].auth_user,
            password:   auth_mes_obj[0].auth_password,
            database: auth_mes_obj[0].auth_database
        });
    
        poolMES.getConnection(function(err, connection){

            io.on('connection', function(socket){

                socket.on('dateAndprocess', function(dateAndprocess_obj){

                    let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                    let process = dateAndprocess_obj[0].process_name;
                    // hourly outs
                    connection.query({
                        sql: 'SELECT process_id, SUM(out_qty) AS out_qty, HOUR(DATE_ADD(date_time, INTERVAL -390 MINUTE)) + 1 AS fab_hour , count(*) AS num_moves FROM MES_OUT_DETAILS WHERE process_id = ? AND DATE(DATE_ADD(date_time, INTERVAL -390 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) GROUP BY process_id, HOUR(DATE_ADD(date_time, INTERVAL -390 MINUTE))',
                        values: [process, datetime]

                    },  function(err, results, fields){
                        console.log(results);
                        socket.emit('dateAndprocess', results);
                    });
            
                });

            });

        });

    });
    
}


