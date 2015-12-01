var path = require('path');
var util = require('util');
var slash = require('slash');

var fs = require ('../util/fs');
var through2 = require('through2');
var File = require('vinyl');

var Promise = require('bluebird');
var glob = Promise.promisify(require('glob'));

// vinyl-fs reads all files as buffers or streams. Many files we don't actually
// end up copying, so we want to be somewhat lazy about them. The StreamFile
// class generates the content stream only on first use, which also helps
// avoid emfile errors (too many open files).
function ResourceFile(directory, filename, outputDirectory, statCache) {

  if (!filename) { throw new Error("Expected a filename"); }

  this.sourcePath = path.resolve(directory.src, filename);
  this.sourceDirectory = directory.src;

  // a vinyl file records changes to the file's path -- the first path in the
  // history is the location on disk, then we set the path to the target
  // location
  File.call(this, {
    base: directory.src,
    path: this.sourcePath,
    stat: statCache && statCache[this.sourcePath]
  });

  this.sourceRelativePath = path.relative(this.sourceDirectory, this.sourcePath);
  this.targetRelativePath = slash(path.join(directory.target, this.sourceRelativePath));

  this.base = outputDirectory;
  this.path = path.join(outputDirectory, this.targetRelativePath);

  this._isStream = true;
}

util.inherits(ResourceFile, File);

ResourceFile.prototype.getOption = function (key) {
  return this.options.get(this.sourcePath, key);
};

ResourceFile.prototype.setContents = function (contents) {
  this._contents = typeof contents == 'string' ? new Buffer(contents) : contents;
  this._isStream = false;
};

ResourceFile.prototype.isStream = function () { return this._isStream; };

ResourceFile.prototype.getCompressOpts = function () {
  if (!this._compressOpts) {
    var compressOpts = this.getOption('compress');
    if (!compressOpts) {
      // handle legacy options
      if (this.getOption('forceJpeg')) {
        compressOpts = {
          format: 'jpg'
        };
      } else {
        var legacyPng8Opts = this.getOption('pngquant');
        if (legacyPng8Opts) {
          compressOpts = merge({
            format: 'png',
            quantize: true
          }, legacyPng8Opts);
        }
      }
    }

    if (compressOpts && compressOpts.format) {
      // normalize format
      var format = compressOpts.format;
      format = format.toLowerCase();
      if (format == 'jpeg') { format = 'jpg'; }
      compressOpts.format = format;
    }

    this._compressOpts = compressOpts;
  }

  return this._compressOpts;
};

ResourceFile.prototype.moveToFile = function (target) {
  this.targetRelativePath = slash(target);
  this.path = path.join(this.base, target);
};

ResourceFile.prototype.moveToDirectory = function (target) {
  var basename = path.basename(this.path);
  this.moveToFile(path.join(target, basename));
};

Object.defineProperty(ResourceFile.prototype, 'contents', {
  get: function () {
    if (!this._contents) {
      this._contents = fs.createReadStream(this.sourcePath);
    }

    return this._contents;
  },
  set: function (stream) {
    // vinyl-fs recreates the stream after copying it, which means we might run
    // out of file descriptors. Don't save the new streams in hopes that they
    // get gc'd relatively quickly
  }
});

exports.File = ResourceFile;

exports.getDirectories = require('./directories').get;
exports.getMetadata = require('./metadata').get;
exports.createFileStream = function (api, app, config, outputDirectory, directories) {
  var stream = through2.obj(undefined);
  var statCache = {};
  Promise.resolve(directories || exports.getDirectories(api, app, config))
    .map(function (directory) {
      var files = directory.files && Promise.resolve(directory.files)
                || glob('**/*', {
                        cwd: directory.src,
                        nodir: true,
                        statCache: statCache
                      });

      return files
        .map(function (relativePath) {
          var file = new ResourceFile(directory, relativePath, outputDirectory, statCache);
          return exports.getMetadata(file)
            .then(function (options) {
              file.options = options;
            })
            .return(file);
        })
        .filter(function (file) {
          return file.getOption('package') !== false;
        });
    })
    .then(function (resourceSets) {
      // remove duplicate files based on target directory
      var seen = {};
      for (var i = resourceSets.length - 1; i >= 0; --i) {
        var set = resourceSets[i];
        for (var j = set.length - 1; j >= 0; --j) {
          var file = set[j];
          if (!seen[file.targetRelativePath]) {
            seen[file.targetRelativePath] = true;
            stream.write(file);
          }
        }
      }
    })
    .then(function () {
      stream.end();
    });
  return stream;
};
