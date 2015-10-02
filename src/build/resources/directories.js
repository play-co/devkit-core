var path = require('path');

var fs = require('../util/fs');
var DirectoryBuilder = require('./DirectoryBuilder');

/**
 * Return a list of directories containing resources for an app
 */
exports.get = function (api, app, config) {
  var appPath = app.paths.root;
  var logger = api.logging.get('directories');
  var builder = new DirectoryBuilder(logger, appPath);

  // build extensions can add additional resource directories
  Object.keys(app.modules).forEach(function (name) {
    var module = app.modules[name];
    if (module.extensions.build) {
      var extension = require(module.extensions.build);
      if (extension && extension.getResourceDirectories) {
        extension.getResourceDirectories(api, app, config)
          .map(function (directory) {
            var target = path.join('modules', module.name, directory.target);
            builder.add(directory.src, target, directory.files);
          });
      }
    }
  });

  // add primary resource directory
  builder.add('resources');

  // add any localized resource directories
  return fs.readdirAsync(appPath).filter(function (filename) {
      if (/^resources-/.test(filename)) {
        return fs.statAsync(path.join(appPath, filename)).then(function (info) {
          return info.isDirectory();
        }, function onStatFail() {
          return false;
        });
      }

      return false;
    }).map(function (filename) {
      builder.add(filename);
    }).then(function () {
      return builder.getDirectories();
    });
};
