let Promise = require('bluebird');
let bodyParser = require('body-parser');
let mysqlLocal = require('../dbConfig/dbLocal');
let mysqlCloud = require('../dbConfig/dbCloud');
let mysqlMES = require('../dbConfig/dbMES');
let moment = require('moment');

let regression = require('regression');

module.exports = function(io){

    io.on('connection', function(socket){

        socket.on('dateAndprocess', function(dateAndprocess_obj){   // socket listener for date and process
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

            mysqlMES.poolMES.getConnection(function(err, connection){ // Linearity Pool

                dateAndprocess_obj_isValid().then(function(dateAndprocess_obj_valid){
                    function is_shift_AMorPM(){ //  check if AM or PM
                        return new Promise(function(resolve, reject){
                            let today_date = Date.parse(moment(dateAndprocess_obj_valid.dtime));
                            let shift_AM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_AM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:49:59')); // adjusting + 20mins to parallel in DB update
    
                            let shift_PM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_MID_pre = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 23:59:59'));
                            let shift_MID_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 00:00:00'));
                            let shift_PM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:49:59')); // adjusting + 20mins to parallel in DB update
    
                            if(today_date >= shift_AM_start && today_date <= shift_AM_end){ // AM shift
                                resolve('AM');
                                console.log('AM');
                            } else if(today_date >= shift_PM_start && today_date <= shift_MID_pre) { // PREPM shift
                                resolve('PREPM');
                                console.log('PREPM');
                            } else if(today_date >= shift_MID_start && today_date <= shift_PM_end){
                                resolve('POSTPM');
                                console.log('POSTPM');
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
                                       // console.log(results);
                                        resolve(results);
                                    });

                                } else if(AMorPM == 'PREPM'){

                                    connection.query({
                                        sql: 'SELECT process_id, SUM(out_qty) AS out_qty, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) + 1 AS fab_hour , count(*) AS num_moves FROM MES_OUT_DETAILS WHERE process_id = ? AND DATE(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) GROUP BY process_id, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE))',
                                        values: [process, datetime]
                
                                    },  function(err, results, fields){
                                      //  console.log(results);
                                        resolve(results);
                                    });

                                } else if(AMorPM == 'POSTPM'){

                                    connection.query({
                                        sql: 'SELECT process_id, SUM(out_qty) AS out_qty, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) + 1 AS fab_hour , count(*) AS num_moves FROM MES_OUT_DETAILS WHERE process_id = ? AND DATE(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(? , INTERVAL -1 DAY)) GROUP BY process_id, HOUR(DATE_ADD(date_time, INTERVAL -1110 MINUTE))',
                                        values: [process, datetime]
                
                                    },  function(err, results, fields){
                                      //  console.log(results);
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
    
                                        for(let i=0; i<results.length; i++){  // cleaning result preparing for linear coordinates
                                            forLinear.push({
                                                process_id: results[i].process_id,
                                                x: results[i].fab_hour,
                                                y: results[i].out_qty
                                            });
                                        }

                                        for(let i=0; i<results.length; i++){ // cleaning result preparing for xy outs coordinates
                                            xArr_outs.push(
                                                results[i].fab_hour
                                            );

                                            yArr_outs.push(
                                                results[i].out_qty
                                            )
                                        }
    
                                        for(let i=0; i<forLinear.length; i++){ // for linear data to regression line
                                            forLinear_data.push(
                                                [forLinear[i].x, forLinear[i].y]
                                            )
                                        }
                                        
                                        let ggLinear = regression.linear(forLinear_data, {order : 1});  // compute SLR
                                        // console.log(ggLinear);
                                        
                                        for(let i=0; i<ggLinear.points.length; i++){ // cleaning for trace linear line

                                            xArr.push(
                                                ggLinear.points[i][0]
                                            );

                                            yArr.push(
                                                ggLinear.points[i][1]
                                            );
                                        }

                                        
                                        trace.push({ // simple linear regression line object to client
                                            x: xArr,
                                            y: yArr,
                                            type: 'scatter',
                                            mode: 'lines',
                                            name: 'Trend',
                                            line : {
                                                width: '0.8'
                                            }

                                        });

                                        trace_outs.push({ // x y coordinates for outs object to client
                                            x: xArr_outs,
                                            y: yArr_outs,
                                            type: 'scatter',
                                            name: 'Outs',
                                            line: {
                                                width: '1.5'
                                            }

                                        });

                                        let linear_traces = [trace[0], trace_outs[0]];

                                        //console.log(linear_traces);
                                        resolve(linear_traces);
                                    }

                                });
                                
                            }

                            cleaning4Linearity().then(function(linear_traces){ // socket emitter containing linear_traces object :O
                                socket.emit('dateAndprocess', linear_traces);
                                
                                connection.release(); // release woo.
                            });

                        });
                    });
                });

            });

        });

        socket.on('yieldPerTool', function(dateAndprocess_obj){ // socket listener for yield loss per tool
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

            mysqlMES.poolMES.getConnection(function(err, connection){ // Yield Pool

                dateAndprocess_obj_isValid().then(function(dateAndprocess_obj_valid){
                    function is_shift_AMorPM(){ //  check if AM or PM
                        return new Promise(function(resolve, reject){
                            let today_date = Date.parse(moment(dateAndprocess_obj_valid.dtime));
                            let shift_AM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_AM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:49:59')); // adjusting + 20mins to parallel in DB update
    
                            let shift_PM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_MID_pre = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 23:59:59'));
                            let shift_MID_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 00:00:00'));
                            let shift_PM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:49:59')); // adjusting + 20mins to parallel in DB update
    
                            if(today_date >= shift_AM_start && today_date <= shift_AM_end){ // AM shift
                                resolve('AM');
                                console.log('AM');
                            } else if(today_date >= shift_PM_start && today_date <= shift_MID_pre) { // PREPM shift
                                resolve('PREPM');
                                console.log('PREPM');
                            } else if(today_date >= shift_MID_start && today_date <= shift_PM_end){
                                resolve('POSTPM');
                                console.log('POSTPM');
                            }
                        });
                    }
                    
                    is_shift_AMorPM().then(function(AMorPM){
                        function outsAndScrap_per_tool(){ // function query for out and scrap per tool
                            return new Promise(function(resolve, reject){
            
                                let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                                let process = dateAndprocess_obj[0].process_name;

                                connection.query({
                                    sql: 'SET time_zone = "+08:00"'
                                });

                                if(AMorPM == 'AM'){
                                    
                                    connection.query({
                                        sql: 'SELECT A.eq_name AS eq_name, A.scrap_qty AS scrap_qty, B.out_qty AS out_qty FROM   (SELECT B.eq_name, SUM(A.scrap_qty) AS scrap_qty    FROM MES_SCRAP_DETAILS A      JOIN MES_EQ_INFO B  ON A.eq_id = B.eq_id     WHERE DATE(DATE_ADD(A.date_time, INTERVAL -390 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE))   AND A.process_id = ?     GROUP BY B.eq_name ) A JOIN   (SELECT B.eq_name, SUM(A.out_qty) AS out_qty     FROM MES_OUT_DETAILS A     JOIN MES_EQ_INFO B   ON A.eq_id = B.eq_id    WHERE DATE(DATE_ADD(A.date_time, INTERVAL -390 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE))   AND A.process_id = ?  GROUP BY B.eq_name ) B ON A.eq_name = B.eq_name',
                                        values: [datetime, process, datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                        resolve(results);
                                    });

                                } else if(AMorPM == 'PREPM'){

                                    connection.query({
                                        sql: 'SELECT A.eq_name AS eq_name, A.scrap_qty AS scrap_qty, B.out_qty AS out_qty FROM   (SELECT B.eq_name, SUM(A.scrap_qty) AS scrap_qty    FROM MES_SCRAP_DETAILS A      JOIN MES_EQ_INFO B  ON A.eq_id = B.eq_id     WHERE DATE(DATE_ADD(A.date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE))   AND A.process_id = ?     GROUP BY B.eq_name ) A JOIN   (SELECT B.eq_name, SUM(A.out_qty) AS out_qty     FROM MES_OUT_DETAILS A     JOIN MES_EQ_INFO B   ON A.eq_id = B.eq_id    WHERE DATE(DATE_ADD(A.date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE))   AND A.process_id = ?  GROUP BY B.eq_name ) B ON A.eq_name = B.eq_name',
                                        values: [datetime, process, datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                        resolve(results);
                                    });

                                } else if(AMorPM == 'POSTPM'){

                                    connection.query({
                                        sql: 'SELECT A.eq_name AS eq_name, A.scrap_qty AS scrap_qty, B.out_qty AS out_qty FROM   (SELECT B.eq_name, SUM(A.scrap_qty) AS scrap_qty    FROM MES_SCRAP_DETAILS A      JOIN MES_EQ_INFO B  ON A.eq_id = B.eq_id     WHERE DATE(DATE_ADD(A.date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -1 DAY))   AND A.process_id = ?     GROUP BY B.eq_name ) A JOIN   (SELECT B.eq_name, SUM(A.out_qty) AS out_qty     FROM MES_OUT_DETAILS A     JOIN MES_EQ_INFO B   ON A.eq_id = B.eq_id    WHERE DATE(DATE_ADD(A.date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -1 DAY))   AND A.process_id = ?  GROUP BY B.eq_name ) B ON A.eq_name = B.eq_name',
                                        values: [datetime, process, datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                        resolve(results);
                                    });

                                }
            
            
                            });
                        }

                        outsAndScrap_per_tool().then(function(results){
                            function cleaning4Yield(){ // cleaning result object
                                return new Promise(function(resolve, reject){
                                    if(typeof results != 'undefined' || results != null){

                                        let tool_details = [];
                                        let xBar = [];
                                        let yBar = [];
                                        let list = []; // for sorting
                                        let bar_trace = [];
                                        let yield_obj = [];


                                        // make it %
                                        for( let i=0; i<results.length; i++){
                                            tool_details.push({
                                                x: results[i].eq_name,
                                                y: ((results[i].scrap_qty / (results[i].scrap_qty + results[i].out_qty)) * 100).toFixed(2)
                                            });
                                        }

                                        for( let i=0; i<tool_details.length; i++){
                                            xBar.push(
                                                tool_details[i].y // swap for horizontal pane - value
                                            );

                                            yBar.push(
                                                tool_details[i].x // eq name
                                            )
                                        }

                                        // 1.) combinining arrays for sort
                                        for( let i=0; i< yBar.length; i++){
                                            list.push({ 'ybar': yBar[i], 'xbar': xBar[i]});
                                        }

                                        // 2.) sort
                                        list.sort(function(a, b){
                                            return ((a.xbar < b.xbar) ? -1 : ((a.xbar == b.xbar) ? 0 : 1));
                                        });

                                        // 3.) separate
                                        for(let i=0; i<list.length;i++){
                                            xBar[i] = list[i].xbar;
                                            yBar[i] = list[i].ybar;
                                        }


                                        bar_trace.push({ // prepare for launch
                                            x: xBar,
                                            y: yBar,
                                            type: "bar",
                                            orientation: "h"
                                        });

                                        yield_obj = bar_trace;

                                       // console.log(yield_obj);
                                        resolve(yield_obj); // T -0
                                        
                                    }

                                });
                                
                            }

                            cleaning4Yield().then(function(yield_objects){ // socket emitter containing linear_traces object :O
                                socket.emit('yieldPerTool', yield_objects);
                                
                                connection.release(); // release woo.
                            });

                        });
                    });
                });

            });
        });

        socket.on('scrapDPPM', function(dateAndprocess_obj){ // scrap dppm socket listener
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

            mysqlMES.poolMES.getConnection(function(err, connection){ // Scrap DPPM Pool

                dateAndprocess_obj_isValid().then(function(dateAndprocess_obj_valid){
                    function is_shift_AMorPM(){ //  check if AM or PM
                        return new Promise(function(resolve, reject){
                            let today_date = Date.parse(moment(dateAndprocess_obj_valid.dtime));
                            let shift_AM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_AM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:49:59')); // adjusting + 20mins to parallel in DB update
    
                            let shift_PM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_MID_pre = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 23:59:59'));
                            let shift_MID_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 00:00:00'));
                            let shift_PM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:49:59')); // adjusting + 20mins to parallel in DB update
    
                            if(today_date >= shift_AM_start && today_date <= shift_AM_end){ // AM shift
                                resolve('AM');
                                console.log('AM');
                            } else if(today_date >= shift_PM_start && today_date <= shift_MID_pre) { // PREPM shift
                                resolve('PREPM');
                                console.log('PREPM');
                            } else if(today_date >= shift_MID_start && today_date <= shift_PM_end){
                                resolve('POSTPM');
                                console.log('POSTPM');
                            }
                        });
                    }
                    
                    is_shift_AMorPM().then(function(AMorPM){
                        function scrap_qty(){ // function query for scrap 
                            return new Promise(function(resolve, reject){
            
                                let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                                let process = dateAndprocess_obj[0].process_name;

                                connection.query({
                                    sql: 'SET time_zone = "+08:00"'
                                });

                                if(AMorPM == 'AM'){
                                    
                                    connection.query({
                                        sql: 'SELECT scrap_code, SUM(scrap_qty) AS scrap_qty FROM MES_SCRAP_DETAILS WHERE DATE(DATE_ADD(date_time, INTERVAL -390 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) AND process_id = ? GROUP BY scrap_code ORDER BY SUM(scrap_qty) DESC LIMIT 5',
                                        values: [datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                       let scrap_results = results;
                                        resolve(scrap_results);
                                    });

                                } else if(AMorPM == 'PREPM'){

                                    connection.query({
                                        sql: 'SELECT scrap_code, SUM(scrap_qty) AS scrap_qty FROM MES_SCRAP_DETAILS WHERE DATE(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -0 MINUTE)) AND process_id = ? GROUP BY scrap_code ORDER BY SUM(scrap_qty) DESC LIMIT 5',
                                        values: [datetime, process, datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                       let scrap_results = results;
                                       resolve(scrap_results);
                                    });

                                } else if(AMorPM == 'POSTPM'){

                                    connection.query({
                                        sql: 'SELECT scrap_code, SUM(scrap_qty) AS scrap_qty FROM MES_SCRAP_DETAILS WHERE DATE(DATE_ADD(date_time, INTERVAL -1110 MINUTE)) = DATE(DATE_ADD(?, INTERVAL -1 DAY)) AND process_id = ? GROUP BY scrap_code ORDER BY SUM(scrap_qty) DESC LIMIT 5',
                                        values: [datetime, process, datetime, process]
                
                                    },  function(err, results, fields){
                                       // console.log(results);
                                       let scrap_results = results;
                                       resolve(scrap_results);
                                    });

                                }
            
            
                            });
                        }

                        function out_qty(){ // function query for outs
                            return new Promise(function(resolve, reject){ 

                                let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                                let process = dateAndprocess_obj[0].process_name;

                                connection.query({
                                    sql: 'SET time_zone = "+08:00"'
                                });

                                if(AMorPM == 'AM'){
                                    
                                    connection.query({
                                        sql: 'SELECT A.proc_id , SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(?," 06:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 18:29:59")',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                        console.log(results);
                                       let outs_results = results;
                                        resolve(outs_results);
                                    });

                                } else if(AMorPM == 'PREPM'){

                                    connection.query({
                                        sql: 'SELECT A.proc_id , SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(?," 18:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 23:59:59")',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                       console.log(results);
                                       let outs_results = results;
                                        resolve(outs_results);
                                    });

                                } else if(AMorPM == 'POSTPM'){

                                    connection.query({
                                        sql: 'SELECT A.proc_id , SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(? + INTERVAL -1 DAY, " 18:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 06:29:59")',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                        console.log(results);
                                       let outs_results = results;
                                        resolve(outs_results);
                                    });

                                }

                            });
                        }

                        scrap_qty().then(function(scrap_results){
                            return out_qty().then(function(outs_results){
                                function cleaning4ScrapDPPM(){ // cleaning result object
                                    return new Promise(function(resolve, reject){
                                        if(typeof scrap_results != 'undefined' || scrap_results != null || typeof outs_results[0] != 'undefined' || outs_results[0] != null){

                                            let scrap_details = [];
                                            let xBarDPPM = [];
                                            let yBarDPPM = [];
                                            let bar_scrap_trace = [];
                                            let scrap_objects = [];
                                            let list = [];


                                            for(let i=0;i<scrap_results.length;i++){
                                                scrap_details.push({
                                                    x: scrap_results[i].scrap_code,
                                                    y: ((scrap_results[i].scrap_qty / (scrap_results[i].scrap_qty + outs_results[0].out_qty))*1000000).toFixed(0)
                                                });
                                            }

                                            for(let i=0;i<scrap_details.length; i++){
                                                xBarDPPM.push(
                                                    scrap_details[i].y // for horizontal
                                                );

                                                yBarDPPM.push(
                                                    scrap_details[i].x // for vertical axis scrap name
                                                );
                                            }

                                            // 1.) combinining arrays for sort reverse
                                            for( let i=0; i< yBarDPPM.length; i++){
                                                list.push({ 'ybar': yBarDPPM[i], 'xbar': xBarDPPM[i]});
                                            }

                                            // 2.) sort
                                            //list.sort(function(a, b){
                                            //     return parseInt(b.xBarDPPM) - parseInt(a.xBarDPPM);
                                            //});
                                            
                                            list.reverse();

                                            //console.log(list);

                                            // 3.) separate
                                            for(let i=0; i<list.length;i++){
                                                xBarDPPM[i] = list[i].xbar;
                                                yBarDPPM[i] = list[i].ybar;
                                            }


                                            bar_scrap_trace.push({
                                                x: xBarDPPM,
                                                y: yBarDPPM,
                                                type: "bar",
                                                orientation: "h",
                                                marker: {
                                                    color: 'rgba(255, 178, 102, 1)'
                                                }
                                            });

                                            scrap_objects = bar_scrap_trace;

                                            //console.log(scrap_objects);
                                            resolve(scrap_objects);
                                            
                                        }

                                    });
                                    
                                }

                                cleaning4ScrapDPPM().then(function(scrap_objects){ // socket emitter containing linear_traces object :O
                                    socket.emit('scrapDPPM', scrap_objects);
                                    
                                    connection.release(); // release woo.
                                });
                            });

                        });
                    });
                });

            });

        });

        socket.on('oee', function(dateAndprocess_obj){
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

            mysqlMES.poolMES.getConnection(function(err, connection){ // Scrap DPPM Pool

                dateAndprocess_obj_isValid().then(function(dateAndprocess_obj_valid){
                    function is_shift_AMorPM(){ //  check if AM or PM
                        return new Promise(function(resolve, reject){
                            let today_date = Date.parse(moment(dateAndprocess_obj_valid.dtime));
                            let shift_AM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_AM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:49:59')); // adjusting + 20mins to parallel in DB update
    
                            let shift_PM_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 18:50:00')); // adjusting + 20mins to parallel in DB update
                            let shift_MID_pre = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 23:59:59'));
                            let shift_MID_start = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 00:00:00'));
                            let shift_PM_end = Date.parse(moment(dateAndprocess_obj_valid.dtime).format('YYYYY-MM-DD, 06:49:59')); // adjusting + 20mins to parallel in DB update
    
                            if(today_date >= shift_AM_start && today_date <= shift_AM_end){ // AM shift
                                resolve('AM');
                                console.log('AM');
                            } else if(today_date >= shift_PM_start && today_date <= shift_MID_pre) { // PREPM shift
                                resolve('PREPM');
                                console.log('PREPM');
                            } else if(today_date >= shift_MID_start && today_date <= shift_PM_end){
                                resolve('POSTPM');
                                console.log('POSTPM');
                            }
                        });
                    }
                    
                    is_shift_AMorPM().then(function(AMorPM){
                        function out_qty_per_tool(){ // function query for outs
                            return new Promise(function(resolve, reject){ 

                                let datetime = moment(dateAndprocess_obj[0].dtime).format('YYYY-MM-DD');
                                let process = dateAndprocess_obj[0].process_name;

                                connection.query({
                                    sql: 'SET time_zone = "+08:00"'
                                });

                                if(AMorPM == 'AM'){
                                    
                                    connection.query({
                                        sql: 'SELECT B.eq_name, SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(?," 06:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 18:29:59")  GROUP BY B.eq_name',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                        //console.log(results);
                                       let outs_per_tool_results = results;
                                        resolve(outs_per_tool_results);
                                    });

                                } else if(AMorPM == 'PREPM'){

                                    connection.query({
                                        sql: 'SELECT B.eq_name, SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(?," 18:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 23:59:59")  GROUP BY B.eq_name',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                        //console.log(results);
                                       let outs_per_tool_results = results;
                                        resolve(outs_per_tool_results);
                                    });

                                } else if(AMorPM == 'POSTPM'){

                                    connection.query({
                                        sql: 'SELECT B.eq_name, SUM(C.out_qty) AS out_qty FROM		 (SELECT eq_id, proc_id  FROM MES_EQ_PROCESS   GROUP BY eq_id ) A     JOIN   MES_EQ_INFO B   ON A.eq_id = B.eq_id   JOIN   MES_OUT_DETAILS C     ON A.eq_id = C.eq_id   WHERE C.process_id = ? AND C.date_time >= CONCAT(? + INTERVAL -1 DAY," 18:30:00") && C.date_time <= CONCAT(? + INTERVAL 0 DAY," 06:29:59")  GROUP BY B.eq_name',
                                        values: [process, datetime, datetime]
                
                                    },  function(err, results, fields){
                                        //console.log(results);
                                       let outs_per_tool_results = results;
                                        resolve(outs_per_tool_results);
                                    });

                                }

                            });
                        }

                        out_qty_per_tool().then(function(outs_per_tool_results){

                        });
                        
                    });
                });

            });
        });
        
        
    });

}


