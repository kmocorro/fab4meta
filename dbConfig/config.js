let mysql = require('mysql');

let connectAuth = mysql.createPool({
    multipleStatements: true,
    connectionLimit: 1000,
    host: 'localhost',
    user: 'root',
    password: '2qhls34r',
    database: 'dbauth'
});

exports.connectAuth = connectAuth;