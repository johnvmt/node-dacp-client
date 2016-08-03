//var EventEmitter = require('events').EventEmitter;
var net = require('net');
var http = require('http');
var querystring = require('querystring');
var crypto = require('crypto');
var mdns = require('mdns');
var Utils = require('./Utils');

function DacpPair() {

	var parsedArgs = Utils.parseArgs(
		arguments,
		[
			{name: 'config', level: 1, validate: function(arg, allArgs) { return typeof(arg) == 'object'; }, default: {}},
			{name: 'callback', level: 1, validate: function(arg, allArgs) { return typeof(arg) === 'function'; },  default: undefined}
		]
	);


	//this.emitter = new EventEmitter();
	
	var defaults = {
		pair: this._randomBaseString(16, 16).toUpperCase(),
		pairPasscode: this._randomBaseString(4, 10),
		deviceName: "Node Remote",
		deviceType: "iPod"
	};

	this.config = Utils.objectMerge(defaults, parsedArgs.config);

	this._pair(parsedArgs.callback);
}

DacpPair.prototype._pair = function(callback) {
	var pairer = this;
	
	pairer._findPairServerPort(function(error, port) {
		if(error) {
			if (typeof callback == 'function')
				callback(error, null);
		}
		else {
			pairer.config.pairServerPort = port;
			
			var pairServerPort = pairer.config.pairServerPort;
			var deviceName = pairer.config.deviceName;
			var deviceType = pairer.config.deviceType;
			var pair = pairer.config.pair;
			var pairPasscode = pairer.config.pairPasscode;


			var mdnsAd = pairer._pairMdns(port, pair, deviceName, deviceType);
			pairer._pairServer(pairServerPort, pair, pairPasscode, deviceName, deviceType, function(error, serviceName) {
				// TODO set service(name) and pair
				// TODO emit paired

				if(!error)
					pairer.config.serviceName = serviceName;
				if(typeof callback == 'function')
					callback(error, {pair: pair, serviceName: serviceName});
				mdnsAd.stop();
			});
		}
	});
};

DacpPair.prototype._findPairServerPort = function(callback) {
	if(typeof this.config.pairServerPort == 'number')
		callback(null, this.config.pairServerPort);
	else
		this._portFinder.find(1024, 65535, callback);
};

DacpPair.prototype._pairMdns = function(port, pair, deviceName, deviceType) {
	var txtRecord = {
		'DvNm': deviceName,
		'DvTy': deviceType,
		'Pair': pair,
		'RemV': '10000',
		'RemN': 'Remote',
		'txtvers': '1'
	};

	var ad = mdns.createAdvertisement(mdns.tcp('_touch-remote'), port, {txtRecord: txtRecord});
	ad.start();

	return ad;
};

DacpPair.prototype._pairServer = function(port, pair, pairPasscode, deviceName, deviceType, callback) {

	// TODO error callbacks

	var values = {
		'cmpg': this._newBuffer(pair, "hex"),
		'cmnm': deviceName,
		'cmty': deviceType
	};

	var buffers = [];

	for(var property in values) {
		if (values.hasOwnProperty(property)) {
			var valBuffer = this._newBuffer(values[property]);
			var lenBuffer = this._newBuffer(binaryLength(valBuffer.length));
			var propBuffer = this._newBuffer(property);
			buffers.push(propBuffer, lenBuffer, valBuffer);
		}
	}

	var body = Buffer.concat(buffers);
	var header = Buffer.concat([this._newBuffer('cmpa'), this._newBuffer(binaryLength(body.length))]);
	var encoded = Buffer.concat([header, body]);

	var httpServer = http.createServer(handleRequest);

	httpServer.listen(port, function() {
		
	});

	var pairHash = pairingHash(pair, pairPasscode);

	function handleRequest(request, response){

		var query = querystring.parse(request.url.substring(request.url.indexOf('?') + 1));

		// TODO error checking that pairingcode exists
		if(query.pairingcode.toUpperCase() == pairHash.toUpperCase()) {
			response.writeHead(200, {
					'Content-Length': encoded.length
				}
			);
			response.end(encoded);
			// TODO add error checking for servicename
			callback(null, query.servicename);
			httpServer.close();
		}
		else {
			response.writeHead(404, {
					'Content-Length': "0"
				}
			);
			response.end();
		}
	}

	function binaryLength(length) {
		var ascii='';
		for (var i=3;i>=0;i--) {
			ascii+=String.fromCharCode((length>>(8*i))&255);
		}
		return ascii;
	}

	function pairingHash(pair, passcode) {
		var merged = pair;

		for(var ctr = 0; ctr < passcode.length; ctr++)
			merged += passcode[ctr] + "\x00";

		return crypto.createHash('md5').update(merged).digest('hex');
	}
};

DacpPair.prototype._randomBaseString = function(length, base) {
	var generated = "";
	for(var ctr = 0; ctr < length; ctr++)
		generated += Math.floor(Math.random() * base).toString(base);
	return generated;
};

DacpPair.prototype._newBuffer = function(contents, type) {
	return typeof Buffer.from == 'function' ? Buffer.from(contents, type) : new Buffer(contents, type);
};

DacpPair.prototype._portFinder = {
	free: function(port, callback) {
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

module.exports = function(config, callback) {
	return new DacpPair(config, callback);
};