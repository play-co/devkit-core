var fs = require('fs');
var ff = require('ff');
var path = require('path');

var exts = {
  '.js': true,
  '.json': true,
  '.css': false // TODO
};

exports.InlineCache = Class(function () {
  this.init = function () {
    this._cache = {};
  }

  this.addFiles = function (files, cb) {
    var f = ff(this, function () {
      for (var i = 0, n = files.length; i < n; ++i) {
        this.add(files[i], f.wait());
      }

      f(this);
    }).cb(cb);
  }

  this.has = function (relativePath) {
    return !!this._cache[relativePath];
  }

  this.add = function (file, cb) {
    var ext = path.extname(file.fullPath);
    if (!exts[ext]) { return cb(); }

    var f = ff(this, function () {
      fs.readFile(file.fullPath, 'utf-8', f());
    }, function (contents) {
      if (ext == '.json') {
        // validate and remove whitespace:
        try {
          contents = JSON.stringify(JSON.parse(contents));
        } catch (e) {
          console.error('invalid JSON:', file.fullPath);
        }
      }

      this._cache[file.target] = contents;
    }).cb(cb);
  }

  this.toJSON = function () {
    return this._cache;
  }
});
