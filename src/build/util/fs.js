
// fixes EMFILE error (too many files open) on OS X
var fs = require('graceful-fs');
fs.gracefulify(require('fs'));

// adds async variants to all fs-extra functions
var Promise = require('bluebird');
module.exports = Promise.promisifyAll(require('fs-extra'));

module.exports.existsAsync = function (filename) {
  return new Promise(function (resolve) {
    fs.exists(filename, function (exists) {
      resolve(exists);
    });
  });
};
