var path = require('path');
var through2 = require('through2');
var File = require('vinyl');

/**
 * Convenience functions for modifying the devkit build stream.  Simplifies the
 * through2 API for a pass-through stream:
 *   createFilterStream(onEach, onEnd):
 *      - onEach(file):
 *          return `api.STREAM_REMOVE_FILE` to remove the file from the stream,
 *          otherwise the file is passed through
 *      - onEnd(addFile, cb):
 *          call `addFile(filename, contents)` to insert a file into the stream,
 *          call `cb()` when finished (to end the current stream)
 */

// adds stream api functions to the api object
exports.addToAPI = function (api, outputDirectory) {

  api.STREAM_REMOVE_FILE = {};

  api.createFilterStream = function (each, atEnd) {
    function addFile(filename, contents) {
      console.log("adding file", filename, contents.length);
      this.push(new File({
        base: outputDirectory,
        path: path.join(outputDirectory, filename),
        contents: typeof contents == 'string' ? new Buffer(contents) : contents
      }));
    }

    return through2.obj(undefined, function onFile(file, enc, cb) {
      // each returns true to remove the file from the stream
      if (!each || each.call(this, file) !== api.STREAM_REMOVE_FILE) {
        this.push(file);
      }

      cb();
    }, atEnd && function (cb) {
      atEnd.call(this, addFile.bind(this), cb);
    });
  };

  api.createEndStream = function (atEnd) {
    return api.createFilterStream(undefined, atEnd);
  };

  /**
   * Inserts an array of files. Any promises in the array are resolved first.
   *
   * Array (post-promise resolution) can contain:
   *   - vinyl File objects
   *   - file object with a name (path relative to the output directory) and the
   *     file contents
   *   - function that willb e called with (atEnd, cb)
   */
  api.insertFilesStream = function (files) {
    return api.createEndStream(function (addFile, cb) {
      Promise.resolve(files)
        .bind(this)
        .map(function (file) {
          if (typeof file == 'function') {
            var onEnd = file;
            return new Promise(function (resolve, reject) {
              onEnd(addFile, resolve);
            });
          } else if (file instanceof File) {
            this.push(file);
          } else if (file.name) {
            addFile(file.name, file.contents);
          }
        })
        .nodeify(cb);
    });
  };

};
