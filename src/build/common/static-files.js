/**
 * simple stream wrapper that exposes a functional interface to add files to the
 * end of a stream
 */
exports.create = function (api) {
  var filesToAdd = [];

  var stream = api.streams.createFileStream({
    onEnd: function (addFile) {
      filesToAdd.forEach(addFile);
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
