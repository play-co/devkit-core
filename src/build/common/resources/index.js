var path = require('path');
var fs = require('fs');
var util = require('util');

var through2 = require('through2');
var File = require('vinyl');
var glob = Promise.promisify(require('glob'));

// utility function to replace any windows path separators for paths that
// will be used for URLs
var regexSlash = /\\/g;
function useURISlashes (str) { return str.replace(regexSlash, '/'); }

// vinyl-fs reads all files as buffers or streams. Many files we don't actually
// end up copying, so we want to be somewhat lazy about them. The StreamFile
// class generates the content stream only on first use, which also helps
// avoid emfile errors (too many open files).
function StreamingFile(directory, filename, outputDirectory) {

  this.sourceFile = path.join(directory.src, filename);
  this.sourceDirectory = directory.src;

  // a vinyl file records changes to the file's path -- the first path in the
  // history is the location on disk, then we set the path to the target
  // location
  File.call(this, {
    base: directory.src,
    path: this.sourceFile
  });

  this.sourceRelativePath = filename;
  this.targetRelativePath = useURISlashes(path.join(directory.target, filename));

  this.base = outputDirectory;
  this.path = path.join(outputDirectory, this.targetRelativePath);
}

util.inherits(StreamingFile, File);

StreamingFile.prototype.getOption = function (key) {
  return this.options.get(this.sourceFile, key);
};

StreamingFile.prototype.isStream = function () { return true; };

StreamingFile.prototype.moveToFile = function (target) {
  this.targetRelativePath = useURISlashes(target);
  this.path = path.join(this.base, target);
};

StreamingFile.prototype.moveToDirectory = function (target) {
  var basename = path.basename(this.path);
  this.moveToFile(path.join(target, basename));
};

Object.defineProperty(StreamingFile.prototype, 'contents', {
  get: function () {
    if (!this._contents) {
      this._contents = fs.createReadStream(this.sourceFile);
    }

    return this._contents;
  },
  set: function (stream) {
    // vinyl-fs recreates the stream after copying it, which means we might run
    // out of file descriptors. Don't save the new streams in hopes that they
    // get gc'd relatively quickly
  }
});

exports.getDirectories = require('./directories').get;
exports.getMetadata = require('./metadata').get;
exports.createFileStream = function (api, app, config, outputDirectory) {
  var stream = through2.obj(undefined);
  Promise.resolve(exports.getDirectories(api, app, config))
    .map(function (directory) {
      return glob('**/*', {cwd: directory.src, nodir: true})
        .map(function (relativePath) {
          var file = new StreamingFile(directory, relativePath, outputDirectory);
          return exports.getMetadata(file)
            .then(function (options) {
              file.options = options;
            })
            .return(file);
        })
        .filter(function (file) {
          return file.getOption('package') !== false;
        })
        .map(function (file) {
          stream.write(file);
        });
    })
    .then(function () {
      stream.end();
    });
  return stream;
};
