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
exports.addToAPI = function (api, app, config) {

  api.STREAM_REMOVE_FILE = {};

  api.streams = {
    get: function (key, opts) {
      switch (key) {
        case 'spriter':
          return require('./spriter').sprite(api, config);
        case 'inline-cache':
          return require('./inlineCache').create(api);
        case 'app-js':
          return require('./appJS').create(api, app, config, opts);
        case 'fonts':
          return require('./fonts').create(api, config);
        case 'html':
          return require('./html').create(api, app, config, opts);
      }
    }
  };

  api.streamToPromise = function (stream) {
    return new Promise(function (resolve, reject) {
      stream
        .on('end', resolve)
        .on('error', reject);
    });
  };

  // api.createFileStream = function (opts) {
  //   var stream = through2.obj(undefined, function onFile(file, enc, cb) {
  //     if (opts.parent) {
  //       opts.parent.write(file);
  //     } else if (opts.each) {
  //       opts.each.call(stream, file, cb);
  //     }
  //   });
  // };

  api.createFilterStream = function (each, atEnd) {
    function addFile(filename, contents, opts) {
      var file = new File({
        base: config.outputResourcePath,
        path: path.join(config.outputResourcePath, filename),
        contents: typeof contents == 'string' ? new Buffer(contents) : contents
      });

      if (opts && ('inline' in opts)) {
        file.inline = opts.inline;
      }

      this.push(file);
    }

    return through2.obj(undefined, function onFile(file, enc, cb) {
      // each returns true to remove the file from the stream
      if (!each || each.call(this, file) !== api.STREAM_REMOVE_FILE) {
        this.push(file);
      }

      cb();
    }, function (cb) {
      atEnd = atEnd || this.onEnd;
      if (atEnd) {
        atEnd.call(this, addFile.bind(this), cb);
      } else {
        cb();
      }
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
