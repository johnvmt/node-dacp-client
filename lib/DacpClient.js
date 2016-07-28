var http = require('http');
var querystring = require('querystring');
var crypto = require('crypto');

// TODO load mdns on demand
var mdns = require('mdns');

// TODO issue pull request for forked version of node-daap and revert to npm-published version
var daap = require('node-daap');
var request = require('request');
var Utils = require('./Utils');

function DacpClient(config) {
	var defaults = {
		pair: Utils.randomBaseString(16, 16).toUpperCase(),
		pairPasscode: Utils.randomBaseString(4, 10),
		pairServerPort: 50509,
		deviceName: "Node Remote",
		deviceType: "iPod",
		serverPort: "3689"
	};
	
	this.config = Utils.objectMerge(defaults, config);

	this.services = {};

	console.log("PASSCODE", this.config.pairPasscode);
	console.log("PAIR", "0x" + this.config.pair);
}

DacpClient.prototype.sessionRequest = function(requestPath, requestQuery, callback) {
	if(typeof this.config.sessionId != 'undefined')
		this.request(requestPath, Utils.objectMerge(requestQuery, {'session-id': this.config.sessionId}), callback);
	else
		callback('sessionId_not_set', null);
};

DacpClient.prototype.request = function() {
	var parsedArgs = Utils.parseArgs(
		arguments,
		[
			{name: 'requestPath', level: 0, validate: function(arg, allArgs) { return typeof(arg) == 'string'; }},
			{name: 'requestQuery', level: 1, validate: function(arg, allArgs) { return typeof(arg) == 'object'; }, default: {}},
			{name: 'callback', level: 1, validate: function(arg, allArgs) { return typeof(arg) === 'function'; },  default: undefined}
		]
	);

	var options = {
		encoding: null,
		url: 'http://' + this.config.serverHost + ':' + this.config.serverPort + '/' + parsedArgs.requestPath,
		qs: parsedArgs.requestQuery,
		headers: {
			'Viewer-Only-Client': '1'
		}
	};

	request(options, function(error, response, body) {
		if(typeof parsedArgs.callback == 'function') {
			try {
				var decoded = daap.decode(body);
				parsedArgs.callback(null, decoded);
			}
			catch(error) {
				parsedArgs.callback(error, null);
			}
		}
	});
};

DacpClient.prototype.login = function(callback) {
	var client = this;
	var pairingGuid = '0x' + client.config.pair;
	client.request('login', {'pairing-guid': pairingGuid}, function(error, response) {
		if(error)
			callback(error, null);
		else if(typeof response['mlid'] == 'undefined')
			callback("mlid_missing", null);
		else {
			client.config.sessionId = response['mlid'];
			callback(null, response['mlid']);
		}
	});
};

DacpClient.prototype.pair = function(callback) {
	var client = this;
	var port = this.config.pairServerPort;
	var deviceName = this.config.deviceName;
	var deviceType = this.config.deviceType;
	var pair = this.config.pair;
	var pairPasscode = this.config.pairPasscode;

	var mdnsAd = this._pairMdns(port, pair, deviceName, deviceType);
	client._pairServer(port, pair, pairPasscode, deviceName, deviceType, function(error, service) {
		// TODO set service(name) and pair
		// TODO emit paired

		if(!error)
			client.config.service = service;
		if(typeof callback == 'function')
			callback(error, service);

		mdnsAd.stop();
	});
};

DacpClient.prototype.serviceMonitor = function() {
	// TODO emit up/down
	var client = this;
	this.serverMonitor(function(service) {
		var serviceFiltered = Utils.objectGet(service, [['name', 'host', 'port']]);
		client.services[serviceFiltered['name']] = serviceFiltered;
		// TODO emit
	}, function(service) {
		if(typeof client.services[service['name']] == "object")
			delete client.services[service['name']];
		// TODO emit
	});

};

DacpClient.prototype.serverMonitor = function(callbackUp, callbackDown) {

	// TODO emit serverUp, serverDown

	var sequence = [
		mdns.rst.DNSServiceResolve(),
		'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]}),
		mdns.rst.makeAddressesUnique()
	];
	var browser = mdns.createBrowser(mdns.tcp('touch-able'), {resolverSequence: sequence});

	browser.on('serviceUp', callbackUp);

	browser.on('serviceDown', callbackDown);

	browser.on('error', function (error) {
		console.log("error");
		console.log(error);
	});

	browser.start();
	
};

/**
 *
 * @param port
 * @param pair
 * @param pairPasscode
 * @param deviceName
 * @param deviceType
 * @param callbackSuccess
 * @private
 */
DacpClient.prototype._pairServer = function(port, pair, pairPasscode, deviceName, deviceType, callback) {

	// TODO error callbacks

	var values = {
		'cmpg': Utils.newBuffer(pair, "hex"),
		'cmnm': deviceName,
		'cmty': deviceType
	};

	var buffers = [];

	for(var property in values) {
		if (values.hasOwnProperty(property)) {
			var valBuffer = Utils.newBuffer(values[property]);
			var lenBuffer = Utils.newBuffer(binaryLength(valBuffer.length));
			var propBuffer = Utils.newBuffer(property);
			buffers.push(propBuffer, lenBuffer, valBuffer);
		}
	}

	var body = Buffer.concat(buffers);
	var header = Buffer.concat([Utils.newBuffer('cmpa'), Utils.newBuffer(binaryLength(body.length))]);
	var encoded = Buffer.concat([header, body]);

	var httpServer = http.createServer(handleRequest);

	httpServer.listen(port, function(){
		console.log("Server listening on: http://localhost:%s", 50508);
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

/**
 *
 * @param port
 * @param pair
 * @param deviceName
 * @param deviceType
 * @returns {*}
 * @private
 */
DacpClient.prototype._pairMdns = function(port, pair, deviceName, deviceType) {
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

module.exports = function(config) {
	return new DacpClient(config);
};