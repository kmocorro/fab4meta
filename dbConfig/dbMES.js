let mysql = require('mysql');
let Promise = require('bluebird');
let connectAuth = require('./config');

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
        connectionLimit: 10000,
        host: auth_mes_obj[0].auth_host,
        user:   auth_mes_obj[0].auth_user,
        password:   auth_mes_obj[0].auth_password,
        database: auth_mes_obj[0].auth_database
    });
    exports.poolMES = poolMES;
});