var fs = require('../util/fs');
var mime = require('mime');

exports.toDataURI = function (data, mime) {
  return 'data:' + mime + ';base64,' + new Buffer(data).toString('base64');
};

exports.getBase64Image = function (filename) {
  return exports.toDataURI(fs.readFileSync(filename), mime.lookup(filename));
};
