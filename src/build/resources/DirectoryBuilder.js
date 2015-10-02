var path = require('path');
var fs = require('../util/fs');

// class for representing a list of resource directories
function DirectoryBuilder(logger, base) {
  this._logger = logger;
  this._base = base;
  this._directories = [];
}

DirectoryBuilder.prototype.add = function (src, target, files) {
  var directory;
  if (arguments.length === 1) {
    directory = {
        src: path.join(this._base, src),
        target: src
      };
  } else {
    directory = {
        src: src,
        target: target,
        files: files
      };
  }

  if (fs.existsSync(directory.src)) {
    this._directories.push(directory);
  } else {
    this._logger.warn('Directory does not exist, ignoring files from',
                      directory);
  }
};

DirectoryBuilder.prototype.getPaths = function () {
  return this._directories.map(function (dir) { return dir.src; });
};

DirectoryBuilder.prototype.getDirectories = function () {
  return this._directories;
};

module.exports = DirectoryBuilder;
