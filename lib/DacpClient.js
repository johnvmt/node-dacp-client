// TODO issue pull request for forked version of node-daap and revert to npm-published version
var EventEmitter = require('events').EventEmitter;
var daap = require('node-daap');
var request = require('request');
var Utils = require('./Utils');
var DacpPair = require('./DacpPair');
var MdnsMonitor = require('./MdnsMonitor');

/**
 *
 * @param config
 * @constructor
 */
function DacpClient(config) {
	var client = this;

	// event emitter setup

	client.status = 'initializing';
	client.on('status', function(status) {
		client.status = status;
	});

	// config setup
	var defaults = {
		serverPort: 3689,
		subscribe: true
	};

	client.config = Utils.objectMerge(defaults, config);

	// set server
	if(typeof client.config.serverHost == 'string' && typeof client.config.serverPort == 'number')
		client.server = {host: client.config.serverHost, port: client.config.serverPort};

	// mdns monitor setup
	client.services = {};
	client._startMonitor();


	process.nextTick(function() {
		// If IP is set, do nothing
		// If ServiceNeme is set, find IP
		// If neither IP nor ServiceName are set, pair
		if(typeof client.config.serverHost == 'string' || typeof client.config.serviceName == 'string')
			client._login(function(error) {
				if(error)
					client.emit('error', error);
			});
		else {
			client._pair();

			// login after successful pairing
			client.once('paired', function() {
				client._login();
			});
		}
	}); // Postpone until next tick so event handlers can be invoked

}

DacpClient.prototype.__proto__ = EventEmitter.prototype;

/**
 *
 * @param requestPath
 * @param requestQuery
 * @param callback
 */
DacpClient.prototype.sessionRequest = function(requestPath, requestQuery, callback) {
	var client = this;
	if(client.status == 'authenticated') // already authenticated
		makeRequest();
	else { // make request after authentication
		client.once('authenticated', makeRequest);
		client._login();
	}

	function makeRequest() {
		if(typeof client.config.sessionId != 'undefined')
			client.request(requestPath, Utils.objectMerge(requestQuery, {'session-id': client.config.sessionId}), callback);
		else
			callback('sessionId_not_set', null);
	}

};

/**
 *
 * @param requestPath
 * @param requestQuery
 * @param callback
 */
DacpClient.prototype.requestRaw = function() {
	// TODO return a requestObject with status and cancellation function

	var client = this;

	var parsedArgs = Utils.parseArgs(
		arguments,
		[
			{name: 'requestPath', level: 0, validate: function(arg, allArgs) { return typeof(arg) == 'string'; }},
			{name: 'requestQuery', level: 1, validate: function(arg, allArgs) { return typeof(arg) == 'object'; }, default: {}},
			{name: 'callback', level: 1, validate: function(arg, allArgs) { return typeof(arg) === 'function'; },  default: undefined}
		]
	);


	client._getHost(function(error, server) {
		if(error) {
			if(typeof parsedArgs.callback == 'function')
				parsedArgs.callback(error, null);
		}
		else {
			var options = {
				encoding: null,
				url: 'http://' + server.host + ':' + server.port + '/' + parsedArgs.requestPath,
				qs: parsedArgs.requestQuery,
				headers: {
					'Viewer-Only-Client': '1'
				}
			};

			request(options, function(error, response, body) {
				if(typeof parsedArgs.callback == 'function')
					parsedArgs.callback(error, body);
			});
		}
	});
};

/**
 *
 * @param requestPath
 * @param requestQuery
 * @param callback
 */
DacpClient.prototype.request = function() {
	var rawRequestArgs = Array.prototype.slice.call(arguments);

	if(rawRequestArgs.length > 0 && typeof rawRequestArgs[rawRequestArgs.length - 1] == 'function') // last argument is callback; remove it
		var requestCallback = rawRequestArgs.pop();

	// replace callback with decoder callback
	rawRequestArgs.push(function(error, rawResponse) {
		if(typeof requestCallback == 'function') {
			try {
				requestCallback(null, daap.decode(rawResponse));
			}
			catch(error) {
				requestCallback(error, null);
			}
		}
	});

	this.requestRaw.apply(this, rawRequestArgs);
};

/**
 *
 * @param callback
 * @private
 */
DacpClient.prototype._login = function(callback) {
	var client = this;

	if (client.status == 'authenticating') { // login already in progress
		client.once('authenticated', function () {
			successCallback();
		});
	}
	else if(typeof client.config.pair == 'string') {
		client.emit('status', 'authenticating');
		var pairingGuid = '0x' + client.config.pair;

		client.request('login', {'pairing-guid': pairingGuid}, function(error, response) {
			if(error) {
				if(typeof callback == 'function')
					callback(error, null);
			}
			else if(typeof response['mlid'] == 'undefined') {
				if(typeof callback == 'function')
					callback('mlid_missing', null);
			}
			else {
				client.config.sessionId = response['mlid'];
				client.emit('status', 'authenticated');
				client.emit('authenticated');
				successCallback();
			}
		});
	}
	else {
		if(typeof callback == 'function')
			callback('pair_not_set', null);
	}

	function successCallback() {
		callback(null, client.config.sessionId);
	}
};

/**
 *
 * @param callback
 * @private
 */
DacpClient.prototype._getHost = function(callback) {
	/*
		if IP set, return
		if ServiceName set, wait for service to come up, then return
	*/
	var client = this;
	if(typeof client.server == 'object') // host IP/port set
		callback(null, client.server);
	else if(typeof client.config.serviceName == 'string') { // mdns service name set
		client.once('serviceUp', function() {
			callback(null, client.server);
		});
	}
	else
		callback('host_service_not_set', null);

};

/**
 *
 * @private
 */
DacpClient.prototype._startMonitor = function() {
	var client = this;

	client.monitor = MdnsMonitor('touch-able');

	client.monitor.on('serviceUp', function(service) {
		var serviceFiltered = Utils.objectGet(service, [['name', 'host', 'port']]);
		client.services[serviceFiltered['name']] = serviceFiltered;
		if(typeof client.config.serviceName == 'string' && service.name == client.config.serviceName) {
			client.server = Utils.objectGet(serviceFiltered, [['host', 'port']]);
			client.emit('serviceUp');
			// TODO change status
		}
	});

	client.monitor.on('serviceDown', function(service) {
		if(typeof client.services[service['name']] == "object")
			delete client.services[service['name']];
		if(typeof client.config.serviceName == 'string' && service.name == client.config.serviceName) {
			delete client.server;
			client.emit('serviceDown');
			client.emit('status', 'disconnected');
		}
	});

	client.monitor.start();

	// subscribe to DACP play status update
	if(client.config.subscribe)
		client._startStatusSubscribe()
};

/**
 *
 * @private
 */
DacpClient.prototype._startStatusSubscribe = function() {
	var client = this;

	getUpdate(1);
	function getUpdate(revisionNumber) {
		client.sessionRequest('ctrl-int/1/playstatusupdate', {'revision-number': revisionNumber}, function(error, response) {
			if(error || response == {})
				getUpdate(1);
			else {
				getUpdate(response['cmsr']);
				client.emit('playstatus', response);
			}
		});
	}
};


/**
 * 
 * @param callback
 * @private
 */
DacpClient.prototype._pair = function(callback) {
	var client = this;

	if(client.status == 'pairing') { // pairing already in progress
		client.once('paired', function (server) {
			successCallback(server);
		});
	}
	else {
		client.emit('status', 'pairing');
		var pairRequest = new DacpPair(client.config, function(error, server) {
			// TODO on pair, emit servicename, pair
			if(error) {
				if(typeof callback == 'function')
					callback(error, null);
				client.emit('error', error);
			}
			else {
				client.config = Utils.objectMerge(client.config, server);
				client.emit('status', 'paired'); // change status
				successCallback(server);
				client.emit('paired', server); // clear pairing queue
			}
		});

		client.emit('passcode', pairRequest.config.pairPasscode); // emit passcode
	}

	function successCallback(server) {
		if(typeof callback == 'function')
			callback(null, server); // TODO get server from config
	}
};

module.exports = function(config) {
	return new DacpClient(config);
};