var url = require('url');
var printf = require('printf');
var slash = require('slash');

// generate an HTML5 offline cache manifest file
exports.generate = function(app, config, files) {
  return new Buffer(printf('CACHE MANIFEST\n' +
    '\n' +
    '#%(appID)s version %(version)s\n' +
    '\n' +
    'CACHE:\n' +
    (config.browser.cache ? config.browser.cache.join('\n') + '\n' : '') +
    '%(resources)s\n' +
    '\n' +
    'FALLBACK:\n' +
    '\n' +
    'NETWORK:\n' +
    '*\n', {
      appID: app.manifest.appID,
      version: config.version,
      resources: files
        .filter(function (file) {
          return !file.inlined;
        })
        .map(function (file) {
          var relative = slash(file.relative);
          if (config.browser.baseURL) {
            return url.resolve(config.browser.baseURL, relative);
          } else {
            return relative;
          }
        }).join('\n')
  }));
};
