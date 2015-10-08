var path = require('path');
var url = require('url');
var printf = require('printf');
var slash = require('slash');
var fs = require('../util/fs');

// generate an HTML5 offline cache manifest file
exports.create = function(api, app, config) {
  var resources = [];

  return api.streams.createFileStream({
    onFile: function (file) {
      if (!file.inlined) {
        var relative = slash(file.relative);
        if (config.browser.baseURL) {
          resources.push(url.resolve(config.browser.baseURL, relative));
        } else {
          resources.push(relative);
        }
      }
    },
    onFinish: function (addFile) {
      addFile({
        filename: config.target + '.manifest',
        contents: printf('CACHE MANIFEST\n' +
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
            resources: resources.join('\n')
          })
      });
    }
  });
};
