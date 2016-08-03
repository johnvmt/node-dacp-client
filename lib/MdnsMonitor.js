var EventEmitter = require('events').EventEmitter;
var mdns = require('mdns');

function MdnsMonitor(serviceName) {

	var monitor = this;

	var resolverSequence = [
		mdns.rst.DNSServiceResolve(),
		'DNSServiceGetAddrInfo' in mdns.dns_sd ? mdns.rst.DNSServiceGetAddrInfo() : mdns.rst.getaddrinfo({families:[4]}),
		mdns.rst.makeAddressesUnique()
	];

	monitor.browser = mdns.createBrowser(mdns.tcp(serviceName), {resolverSequence: resolverSequence});

	monitor.browser.on('serviceUp', function(service) {
		monitor.emit('serviceUp', service);
	});

	monitor.browser.on('serviceDown', function(service) {
		monitor.emit('serviceDown', service);
	});

	monitor.browser.on('error', function(error) {
		monitor.emit('error', error);
	});
}

MdnsMonitor.prototype.__proto__ = EventEmitter.prototype;

MdnsMonitor.prototype.start = function() {
	this.browser.start();
	this.emit('start');
};

MdnsMonitor.prototype.stop = function() {
	this.browser.stop();
	this.emit('stop');
};

module.exports = function(serviceName) {
	return new MdnsMonitor(serviceName);
};