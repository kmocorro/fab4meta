let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let Promise = require('bluebird');
let bodyParser = require('body-parser');

module.exports = function(io){

    io.on('connection', function(socket){

        socket.on('date', function(dtime){
            let dateObj = dtime;
            socket.emit('emitDate', dateObj);
        });

    });

}