let express = require('express');
let app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

let apiController = require('./controllers/apiController');

let Promise = require('bluebird');
let bodyParser = require('body-parser');
let mysqlLocal = require('./dbConfig/dbLocal');
let mysqlCloud = require('./dbConfig/dbCloud');
let mysqlMES = require('./dbConfig/dbMES');

let port = process.env.PORT || 4000;

app.use('/', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');

apiController(app);

// io listeners and emitters
io.on('connection', function(socket){

    //  date io
    socket.on('date', function(dtime){
        mysqlMES.poolMES.getConnection(function(err, connection){
        
            connection.query({
                sql: 'SET time_zone = "+08:00";'
            });
            connection.query({
                sql: 'SELECT NOW() as dbdate'
            },  function(err, results, fields){
                let dbdate = JSON.stringify(results[0].dbdate);
            
                socket.emit('emitDate', dbdate);
                
            });
            connection.release(); 
              
        });
    });

    //  process name io
    socket.on('process_name', function(process_name){
        console.log(process_name.process_name);
    });

});

server.listen(port);
