#!/usr/bin/env node

var program = require('commander');
var chalk = require('chalk');
var request = require('request');

program
    .version('0.0.1');

var publish = program.command('publish');

publish.description('Triggers a publish of the theme. Pulls the HEAD of the configured Git repository')
    .option('-t, --tenant [tenant]', 'REQUIRED - which tenant to use')
    .option('-k, --apiKey [apiKey]', 'REQUIRED - which apiKey to use (for corresponding tenant)')
    .action(function(options) {
        var tenant = options.tenant;
        var apiKey = options.apiKey;

        // Validates inputs
        if (!options || !apiKey) {
            console.log("");
            console.log(chalk.yellow('  INVALID INPUT - Tenant and Apikey both need to be specific to publish'));
            publish.outputHelp();
            return;
        }

        var magicConstants = {
            completedMsg: 'PUBLISH COMPLETED',
            errorMsgPrefix: 'ERROR',
            deploySuccessCode: 202,
            themeStatusSuccessCode: 200,
            pollingInterval: 500
        };

        console.log('Publishing theme for %s with key %s', chalk.blue(tenant), chalk.blue(apiKey));

        // HTTP Basic Auth
        var auth = apiKey + ':' + apiKey + '@';

        // Gets the theme status log, outputting each logItem to `cb`
        var getStatus = function(cb, doneCb) {
            request({
                    uri: 'https://' + auth + 'app.referralsaasquatch.com/api/v1/' + tenant + '/theme/publish_status',
                    method: 'GET'
                },
                function(error, response, body) {
                    if(error){
                        console.log("Unhandled error polling publish status", error);
                        return;
                    }
                    if(response.statusCode != magicConstants.themeStatusSuccessCode){
                        console.log("Unhandled HTTP response polling publish status", response);
                        return;
                    }
                    // console.log("HTTP status: " + response.statusCode);
                    var data = JSON.parse(body);
                    for (var line = data.log.length; line > 0; --line) {
                        var logItem = data.log[line];
                        if (logItem) {
                            cb(logItem);
                        }
                    }
                    if (doneCb) {
                        doneCb();
                    }
                });
        };
        // Recursively watched 
        var watchStatusLog = function(sinceTime) {
            var thisLoopLatest = null;
            var lastMsg = '';
            // console.log('Outputting everything since: ' + sinceTime);
            
            getStatus(function(logItem) {
                if (logItem.timestamp > sinceTime) {
                    lastMsg = logItem.message;
                    thisLoopLatest = logItem.timestamp;
                    if(logItem.message == magicConstants.completedMsg){
                        console.log(chalk.green(logItem.message));
                    }else{
                        console.log(logItem.message);
                    }
                    
                }
            }, function() {
                if (lastMsg == magicConstants.completedMsg) {
                    return; // Quit with success
                }else if (lastMsg.indexOf(magicConstants.errorMsgPrefix) == 0){
                    return; // Quit with Error
                }else{
                    var newSinceTime = thisLoopLatest ? thisLoopLatest : sinceTime;
                    // NOTE -- This is recursion
                    setTimeout(function(){ watchStatusLog(newSinceTime); }, magicConstants.pollingInterval);
                }
            });
        };

        
        var previousDeployTime = 0;
        getStatus(function(logItem) {
                if (logItem.timestamp > previousDeployTime) {
                    previousDeployTime = logItem.timestamp;
                }
            },
            function() {
                request({
                        uri: 'https://' + auth + 'app.referralsaasquatch.com/api/v1/' + tenant + '/theme/publish',
                        method: 'POST',
                        json: {}
                    },
                    function(error, response, body) {
                        if (error) {
                            console.log("Unhandled error publishing theme", error);
                            return;
                        }
                        if(response.statusCode != magicConstants.deploySuccessCode){
                            console.log("Unhandled HTTP response to publishing theme", response);
                            return;
                        }
                        // Triggers log polling since `previousDeployTime`
                        watchStatusLog(previousDeployTime + 1);
                    });
            }
        );
    });


program.command('*')
    .description('Prints help')
    .action(function(options) {
        console.error('Choose a valid command like `publish`');
        program.outputHelp();
    });

program.parse(process.argv);