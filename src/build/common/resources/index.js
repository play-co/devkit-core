var path = require('path');
var fs = require('fs');
var File = require('vinyl');
var glob = Promise.promisify(require('glob'));

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
        var targetPath = path.join(targetDirectory, directory.target, filename);
        var file = new File({
          base: targetDirectory,
          path: srcPath,
          contents: fs.createReadStream(srcPath)
        });

        file.path = targetPath;
        return file;
      })
      .filter(function (file) {
        return exports.getMetadata(file)
          .then(function (options) {
            return options.get('package') !== false;
          });
      });
  }).then(function (fileArrays) {
    // concat all arrays
    return [].concat.apply([], fileArrays);
  });
};
