var url = require('url');
var printf = require('printf');

// generate an HTML5 offline cache manifest file
exports.generate = function(app, config, resourceMap) {
  return printf('CACHE MANIFEST\n' +
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
      resources: Object.keys(resourceMap).map(function (line) {
        if (config.browser.baseURL) {
          return url.resolve(config.browser.baseURL, line);
        } else {
          return line;
        }
      }).join('\n')
  });
}
