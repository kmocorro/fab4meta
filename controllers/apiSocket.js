let Promise = require('bluebird');
let bodyParser = require('body-parser');
let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');

module.exports = function(io){

    // io listeners and emitters
    io.on('connection', function(socket){

        //  date io
        socket.on('date', function(dtime){
            socket.emit('emitDate', JSON.stringify(dtime.dtime)); 
        });

        //  process name io
        socket.on('process_name', function(process_name){
            console.log(process_name.process_name);
        });

    });


}