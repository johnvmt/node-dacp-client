
# DACP Client #

Connect to DACP servers, like Apple's iTunes'. This Node.js module mimics the Remote app.

## Pairing ##

After the pairing process starts, a remote icon will appear in iTunes. Enter the 4-digit code provided below to pair iTunes with the remote.

    var client = require('dacp-client')();
    
    client.on('passcode', function(passcode) {
        // Provides the 4-digit passcode that must be entered in iTunes
       console.log("PASSCODE", passcode);
    });
    
    client.on('paired', function(serverConfig) {
        // Save the serverConfig object, and pass it in as config for future requests
        // Will look something like this: { pair: '21C22EDCEAD6A892', serviceName: '5380431DD0AFAB75' }
        // The service name will remain constant, even if the server's IP changes
       console.log("SERVER", serverConfig);
    });
    
    client.on('error', function(error) {
       console.log("ERROR", error);
    });
    
    client.on('status', function(status) {
       console.log("STATUS", status);
    });
    
## Controlling DACP Server ##

After pairing, you can use the combination of service name or IP/hostname with the pair code to connect to the DACP server and control it

    // Use your own server config. See the pairing process for instructions on getting this information
    var serverConfig = { pair: '21C22EDCEAD6A892', serviceName: '5380431DD0AFAB75' }
    var client = require('dacp-client')(serverConfig);
    
    client.on('error', function(error) {
       console.log("ERROR", error);
    });
    
    client.on('status', function(status) {
       console.log("STATUS", status);
    });
    

    client.on('playstatus', function(status) {
        // Get the server's status each time it changes (shows which song is playing, status etc.
       console.log("PLAYSTATUS", status);
    });
    
    client.sessionRequest('ctrl-int/1/playstatusupdate', {'revision-number': 1}, function(error, response) {
        // Get the player's status
        console.log(error, response);
    });
    
## TODOs ##

* Testing
* Update DAAP library to make parsing responses more complete and reliable