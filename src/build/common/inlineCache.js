var fs = require('fs');
var path = require('path');
var stream = require('stream');
var streamToArray = require('./stream-to-array');
var readFile = Promise.promisify(fs.readFile);

var exts = {
  '.js': true,
  '.json': true,
  '.xml': true,
  '.css': false // TODO
};

exports.InlineCache = Class(function () {
  this.init = function (logger) {
    this._cache = {};
    this._logger = logger;
  };

  this.has = function (relativePath) {
    return !!this._cache[relativePath];
  };

  // returns true if it doesn't add it so that it can be used with a filter
  // function (filter out the files that get inlined)
  this.add = function (file) {
    var ext = path.extname(file.path);
    if (!exts[ext] || file.inline === false) { return true; }

    return new Promise(function (resolve, reject) {
        if (file.contents) {
          resolve(file.contents);
        } else {
          readFile(file.history[0], 'utf8').then(resolve, reject);
        }
      })
      .bind(this)
      .then(function (contents) {
        if (contents instanceof stream.Stream) {
          return streamToArray(contents);
        } else {
          return contents;
        }
      })
      .then(function (contents) {
        if (Array.isArray(contents)) {
          contents = Buffer.concat(contents);
        }

        if (ext === '.json') {
          try {
            contents = JSON.stringify(JSON.parse(contents.toString('utf8')));
          } catch (e) {
            this._logger.error('invalid JSON in', file.path);
            throw e;
          }
        }

        this._cache[file.relative] = contents;

        return false;
      });
  };

  this.toJSON = function () {
    return this._cache;
  };
});
