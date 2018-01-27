let mysql = require('mysql');
let Promise = require('bluebird');
let connectAuth = require('./config');

function authCloud(){
    return new Promise(function(resolve, reject){
        connectAuth.connectAuth.getConnection(function(err, connection){
            connection.query({
                sql: 'SELECT * FROM tbl_cloud_details'
            },  function(err, results, fields){
                let auth_cloud_obj = [];
                    if(results[0].hasAuth == 1){
                        auth_cloud_obj.push({
                            auth_host: results[0].hostname,
                            auth_user: results[0].user,
                            auth_password: results[0].pass,
                            auth_database: results[0].db
                        });
                    }
                resolve(auth_cloud_obj);
            });
            connection.release();
        });
    });
}

authCloud().then(function(auth_cloud_obj){
    let poolCloud = mysql.createPool({
        multipleStatements: 1000,
        connectionLimit: 1000,
        host: auth_cloud_obj[0].auth_host,
        user:   auth_cloud_obj[0].auth_user,
        password:   auth_cloud_obj[0].auth_password,
        database: auth_cloud_obj[0].auth_database
    });
    exports.poolCloud = poolCloud;
});