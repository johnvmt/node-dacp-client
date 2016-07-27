var DacpClient = require('./lib/DacpClient')
module.exports = function(config) {
	return new DacpClient(config);
};