var http = require('http');
var querystring = require('querystring');
var crypto = require('crypto');
var mdns = require('mdns');
var daap = require('node-daap');
var request = require('request');
var Utils = require('./Utils');

function DacpClient(config) {
	this.config = {
		pair: Utils.randomBaseString(16, 16).toUpperCase(),
		pairPasscode: Utils.randomBaseString(4, 10),
		pairServerPort: 50508,
		deviceName: "Node Remote",
		deviceType: "iPod"
	};

	console.log("PASSCODE", this.config.pairPasscode);
	console.log("PAIR", "0x" + this.config.pair);

	this.pair();
}

DacpClient.prototype.pair = function() {

	var port = this.config.pairServerPort;
	var deviceName = this.config.deviceName;
	var deviceType = this.config.deviceType;
	var pair = this.config.pair;
	var pairPasscode = this.config.pairPasscode;

	var mdnsAd = this._pairMdns(port, pair, deviceName, deviceType);
	this._pairServer(port, pair, pairPasscode, deviceName, deviceType, function() {
		console.log("SUCCESSFULLY PAIRED");
		mdnsAd.stop();
	});
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
DacpClient.prototype._pairServer = function(port, pair, pairPasscode, deviceName, deviceType, callbackSuccess) {

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

		if(query.pairingcode.toUpperCase() == pairHash.toUpperCase()) {
			response.writeHead(200, {
					'Content-Length': encoded.length
				}
			);
			response.end(encoded);
			callbackSuccess();
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