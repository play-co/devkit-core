var path = require('path');
var fs = require('fs');
var util = require('util');

var File = require('vinyl');
var glob = Promise.promisify(require('glob'));

// vinyl-fs reads all files as buffers or streams. Many files we don't actually
// end up copying, so we want to be somewhat lazy about them. The StreamFile
// class generates the content stream only on first use, which also helps
// avoid emfile errors (too many open files).
function StreamingFile(opts) {
  File.apply(this, arguments);

  this._originalPath = opts.path;
}

util.inherits(StreamingFile, File);

StreamingFile.prototype.isStream = function () { return true; };

Object.defineProperty(StreamingFile.prototype, 'contents', {
  get: function () {
    if (!this._contents) {
      this._contents = fs.createReadStream(this._originalPath);
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
exports.getFiles = function (targetDirectory, directories) {
  return Promise.resolve(directories).map(function (directory) {
    return glob('**/*', {cwd: directory.src, nodir: true})
      .map(function (filename) {
        // a vinyl file records changes to the file's path -- the first path in
        // the history is the location on disk, then we set the path to the
        // target location
        var srcPath = path.join(directory.src, filename);

        var file = new StreamingFile({
          base: directory.src,
          path: srcPath
        });

        file.originalRelativePath = filename;
        return file;
      })
      .filter(function (file) {
        return exports.getMetadata(file)
          .then(function (options) {
            // console.log(file.relative, options.get('package'))
            return options.get(file.originalRelativePath, 'package') !== false;
          });
      })
      .map(function (file) {
        file.base = targetDirectory;
        file.path = path.join(targetDirectory, directory.target, file.originalRelativePath);
        return file;
      });
  }).then(function (fileArrays) {
    // concat all arrays
    return [].concat.apply([], fileArrays);
  });
};
