var path = require('path');
var fs = require('./util/fs');

module.exports = DiskCache;

// use the devkit build config to generate an absolute path to a cache file
module.exports.getCacheFilePath = function (config, basename) {
  var cacheFilename = (config.cachePrefix || '') + basename;
  return path.join(config.cacheDirectory, cacheFilename);
};

// get a DiskCache instance given the path to a cache file
module.exports.load = function (filename) {
  return fs.mkdirsAsync(path.dirname(filename))
    .then(function () {
      return fs.readFileAsync(filename, 'utf-8');
    })
    .then(function (contents) {
      return JSON.parse(contents);
    })
    .catch(function () {
      return {};
    })
    .then(function (data) {
      return new DiskCache(filename, data);
    });
};

function DiskCache(filename, data) {
  this._filename = filename;
  this._data = data;
  this._newValues = {};
}

DiskCache.prototype.get = function (filename) {
  return fs.statAsync(filename)
    .bind(this)
    .then(function (stat) {
      var mtime = stat.mtime.getTime();
      this._newValues[filename] = mtime;

      var isCached = this._data[filename] === mtime;
      return isCached;
    });
};

DiskCache.prototype.save = function () {
  return fs.writeFileAsync(this._filename, JSON.stringify(this._newValues));
};
