var Utils = {};
var net = require('net');

Utils.portFinder = {
	free: function(port, callback) {
		var net = require('net');
		var server = net.createServer()
			.once('error', function (error) {
				if(error.code != 'EADDRINUSE')
					callback(error, null);
				else
					callback(null, false);
			})
			.once('listening', function() {
				server.once('close', function() {
					callback(null, true);
				})
					.close()
			})
			.listen(port)
	},
	find: function(startPort, endPort, callback) {
		// [startPort, [endPort]], callback

		if(endPort < startPort)
			callback("invalid_range", null);
		else {
			var self = this;
			var testPort = startPort;
			self.free(testPort, afterTest);
		}

		function afterTest(error, isFree) {
			if(!error && isFree)
				callback(null, testPort);
			else {
				if(testPort >= endPort)
					callback("none_free", null);
				else {
					testPort++;
					self.free(testPort, afterTest);
				}
			}
		}
	}
};

Utils.randomBaseString = function(length, base) {
	var generated = "";
	for(var ctr = 0; ctr < length; ctr++)
		generated += Math.floor(Math.random() * base).toString(base);
	return generated;
};

Utils.newBuffer = function(contents, type) {
	return typeof Buffer.from == 'function' ? Buffer.from(contents, type) : new Buffer(contents, type);
};

module.exports = Utils;