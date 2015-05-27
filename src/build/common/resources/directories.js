var fs = require('graceful-fs');
var path = require('path');

var DirectoryBuilder = require('./DirectoryBuilder');

var readDir = Promise.promisify(fs.readdir);
var stat = Promise.promisify(fs.stat);

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
            builder.add(directory.src, target);
          });
      }
    }
  });

  // add primary resource directory
  builder.add('resources');

  // add any localized resource directories
  return readDir(appPath).filter(function (filename) {
      if (/^resources-/.test(filename)) {
        return stat(path.join(appPath, filename)).then(function (info) {
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
