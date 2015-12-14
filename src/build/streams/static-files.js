var Promise = require('bluebird');

/**
 * simple stream wrapper that exposes a functional interface to add files to the
 * end of a stream
 */
exports.create = function (api) {
  var filesToAdd = [];

  var logger = api.logging.get('static-files');

  var stream = api.streams.createFileStream({
    onFinish: function (addFile) {
      return Promise.all(filesToAdd)
        .map(function (file) {
          if (!file) { return; }
          if (file.filename) {
            logger.log('creating', file.filename);
          } else if (file.src) {
            logger.log('copying', file.src);
          }

          addFile(file);
        });
    }
  });

  stream.add = function (fileOpts) {
    if (Array.isArray(fileOpts)) {
      filesToAdd = filesToAdd.concat(fileOpts);
    } else {
      filesToAdd.push(fileOpts);
    }

    return this;
  };

  return stream;
};
