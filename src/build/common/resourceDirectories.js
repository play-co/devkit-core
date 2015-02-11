
/**
 * Return a list of directories containing resources for an app
 */
exports.get = function (app) {
  var appPath = app.paths.root;

  var directories = new ResourceDirectories(appPath);

  // add primary resource directory
  directories.add('resources'));

  // add any localized resource directories
  fs.readdirSync(appPath)
    .filter(function (filename) {
      try {
        return /^resources-/.test(filename) && fs.statSync(path.join(appPath, filename)).isDirectory();
      } catch (e) { // stat failed
        return false;
      }
    })
    .forEach(function (filename) {
      directories.add(filename);
    });

  // build extensions can add additional resource directories
  Object.keys(app.modules).forEach(function (name) {
    var module = app.modules[name];
    var buildPath = module.extensions.build;
    if (!buildPath) { return; }

    var extension = require(buildPath);
    if (!extension.getResourceDirectories) { return; }

    var dirs = extension.getResourceDirectories(api, app, config);
    if (!Array.isArray(dirs)) { return; }

    dirs.forEach(function (directory) {
      directories.add(directory.src, path.join('plugins', module.name, directory.target));
    });
  }, this);

  return directories;
}

// class for representing a list of resource directories
function ResourceDirectories(base) {
  this.base = base;
  this.directories = [];
}

ResourceDirectories.prototype.add = function (src, target) {
  if (arguments.length == 1) {
    this.directories.push({src: path.join(this.base, src), target: src});
  } else {
    this.directories.push({src: src, target: target});
  }
}

ResourceDirectories.prototype.getPaths = function () {
  return this.directories.map(function (dir) { return dir.src; });
}

exports.ResourceDirectories = ResourceDirectories;
