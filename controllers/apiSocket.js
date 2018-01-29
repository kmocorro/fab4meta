let Promise = require('bluebird');
let bodyParser = require('body-parser');
let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let moment = require('moment');

let regression = require('regression');

module.exports = function(io){

    io.on('connection', function(socket){

        socket.on('dateAndprocess', function(dateAndprocess_obj){   // listener for date and process

            mysqlMES.poolMES.getConnection(function(err, connection){
                function dateAndprocess_obj_isValid(){ // check if obj is valid
                    return new Promise(function(resolve, reject){
    
                        if(!dateAndprocess_obj){
                            socket.emit('dateAndprocess', 'dateAndprocess_obj is missing');
                        } else {
                            let dateAndprocess_obj_valid = dateAndprocess_obj;
                            resolve(dateAndprocess_obj_valid);
                        }
    
                    });
                }
    
                dateAndprocess_obj_isValid().then(function(dateAndprocess_obj_valid){
                    function is_shift_AMorPM(){ //  check if AM or PM
                        return new Promise(function(resolve, reject){
                            let today_date = Date.parse(moment(dateAndprocess_obj_valid.dtime));
                            let shift_AM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:30:00'));
                            let shift_AM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:29:59'));
    
                            let shift_PM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:30:00'));
                            let shift_MID_pre = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 11:59:59'));
                            let shift_MID_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 00:00:00'));
                            let shift_PM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:29:59'));
    
                            if(today_date >= shift_AM_start && today_date <= shift_AM_end){ // AM shift
                                resolve('AM');
                                console.log('AM');
                            } else if(today_date >= shift_PM_start && today_date <= shift_MID_pre || today_date >= shift_MID_start && today_date <= shift_PM_end) { // PM shift
                                resolve('PM');
                                console.log('PM');
                            }
                        });
                    }
                    
                    is_shift_AMorPM().then(function(AMorPM){
                        function hourlyOuts(){ // function query for hourly outs
                            return new Promise(function(resolve, reject){
            
                                let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                                let process = dateAndprocess_obj[0].process_name;

                                connection.query({
                                    sql: 'SET time_zone = "+08:00"'
                                });

                                if(AMorPM == 'AM'){
                                    
                                    connection.query({
                                        sql: 'SELECT process_id, SUM(out_qty) AS out_qty, HOUR(DATE_ADD(date_time, INTERVAL -390 MINUTE)) + 1 AS fab_hour , count(*) AS num_moves FROM MES_OUT_DETAILS WHERE process_id = ? AND DATE(DATE_ADD(date_time, INTERVAL -390 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) GROUP BY process_id, HOUR(DATE_ADD(date_time, INTERVAL -390 MINUTE))',
                                        values: [process, datetime]
                
                                    },  function(err, results, fields){
                                        console.log(results);
                                        resolve(results);
                                    });

                                } else if(AMorPM == 'PM'){

                                    connection.query({
                                        sql: 'SELECT process_id, SUM(out_qty) AS out_qty, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) + 1 AS fab_hour , count(*) AS num_moves FROM MES_OUT_DETAILS WHERE process_id = ? AND DATE(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) GROUP BY process_id, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE))',
                                        values: [process, datetime]
                
                                    },  function(err, results, fields){
                                        console.log(results);
                                        resolve(results);
                                    });

                                }
            
            
                            });
                        }

                        hourlyOuts().then(function(results){
                            function cleaning4Linearity(){ // cleaning result object
                                return new Promise(function(resolve, reject){
                                    if(typeof results != 'undefined' || results != null){

                                        let forLinear = [];
                                        let forLinear_data = [];
                                        let xArr = [];
                                        let yArr = [];
                                        let trace = [];

                                        let xArr_outs = [];
                                        let yArr_outs = [];
                                        let trace_outs = [];
    
                                        for(let i=0; i<results.length; i++){
                                            forLinear.push({
                                                process_id: results[i].process_id,
                                                x: results[i].fab_hour,
                                                y: results[i].out_qty
                                            });
                                        }

                                        for(let i=0; i<results.length; i++){
                                            xArr_outs.push(
                                                results[i].fab_hour
                                            );

                                            yArr_outs.push(
                                                results[i].out_qty
                                            )
                                        }
    
                                        for(let i=0; i<forLinear.length; i++){
                                            forLinear_data.push(
                                                [forLinear[i].x, forLinear[i].y]
                                            )
                                        }
                                        
                                        let ggLinear = regression.linear(forLinear_data, {order : 1}); 
                                        console.log(ggLinear);
                                        
                                        for(let i=0; i<ggLinear.points.length; i++){

                                            xArr.push(
                                                ggLinear.points[i][0]
                                            );

                                            yArr.push(
                                                ggLinear.points[i][1]
                                            );
                                        }

                                        
                                        trace.push({
                                            x: xArr,
                                            y: yArr,
                                            type: 'scatter',
                                            mode: 'lines'
                                        });

                                        trace_outs.push({
                                            x: xArr_outs,
                                            y: yArr_outs,
                                            type: 'scatter'
                                        });

                                        let linear_traces = [trace[0], trace_outs[0]];

                                        console.log(linear_traces);
                                        resolve(linear_traces);
                                    }

                                });
                                
                            }

                            cleaning4Linearity().then(function(linear_traces){
                                socket.emit('dateAndprocess', linear_traces);
                            });

                        });
                    });
                });


                connection.release();
            });
            

        });
        
    });

}


