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
        var file = new File({
          base: directory.src,
          path: srcPath,
          contents: fs.createReadStream(srcPath)
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
