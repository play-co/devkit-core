var path = require('path');
var through2 = require('through2');
var File = require('../resources').File;
var Promise = require('bluebird');

/**
 * Simplifies creation of duplex object streams for the devkit use case of
 * streams that only contain File objects.
 *
 * @param {function} opts.onFile called for each file object in the stream. Must
 *     return a Promise to delay the stream if it does any async work.  Can
 *     return api.streams.REMOVE_FILE to filter files from the stream.
 * @param {function} opts.onFinish called when the stream ends with an `addFile`
 *     function that can be called to add additional files to the stream.  Must
 *     return a Promise to delay the stream if it does any async work. addFile
 *     accepts a dictionary with the keys/values:
 *
 *       filename {string}  relative path to file in build output
 *       contents {Buffer | string | Promise} (optional) buffer, string, or
 *                          promise for file's contents
 *       src      {string}  (optional) an absolute path or path relative to
 *                          the app directory from where to copy the contents
 *                          from. If contents is also set, the contents of src
 *                          are ignored.
 *       inline   {boolean} (optional) provides a hint to an inline cacher
 *                          later in the build pipe
 */
module.exports = function createFileStream(api, app, config, opts) {

  var blockingEnd = [];
  var stream = through2.obj(undefined,
        opts.onFile && onFile,
        onFinish);
  return stream;

  function onFile(file, enc, cb) {
    // don't end the read stream though until we've pushed all the data
    // through
    blockingEnd.push(Promise.try(function () {
        return opts.onFile.call(this, file);
      })
      .then(function (res) {
        if (res !== api.streams.REMOVE_FILE) {
          stream.push(file);
        }
      })
      .catch(function (err) {
        stream.emit('error', err);
      }));

    // ok to write more
    cb();
  }

  function addFile(opts) {
    if (!opts) { return; }

    // legacy config, probably from app manifest -- only a single string is
    // provided with no instructions on where it goes
    if (typeof opts == 'string') {
      var filename = opts;
      if (path.isAbsolute(filename)) {
        // legacy config, just an absolute path is provided, copy the file to
        // the root of the output directory
        opts = {
            filename: path.basename(filename),
            src: filename
          };
      } else {
        if (/^\.[\/\\]/.test(filename)) {
          filename = filename[2];
        }

        if (/^\.\.\//.test(filename)) {
          throw new Error('relative path not supported: ' + filename);
        }

        // legacy config, relative project path
        opts = {
            filename: filename
          };
      }
    }

    if (typeof opts.then == 'function') {
      // probably a promise, try to resolve first
      var beforeAddFile = Promise.resolve(opts).then(addFile);
      blockingEnd.push(beforeAddFile);
      return beforeAddFile;
    }

    // opts.src: copy file from source
    // filename: file should have contents
    var file = new File({src: app.paths.root, target: ''}, opts.src || opts.filename, config.outputResourcePath);

    if (opts.src && opts.filename) {
      file.moveToFile(opts.filename);
    }

    // copy extra keys to file object
    for (var key in opts) {
      if (key != 'src' && key != 'contents' && key != 'filename') {
        file[key] = opts[key];
      }
    }

    if (opts.contents) {
      var onContents = Promise.resolve(opts.contents)
        .then(function (contents) {
          file.setContents(contents);
          stream.push(file);
        });
      blockingEnd.push(onContents);
    } else {
      stream.push(file);
    }
  }

  // called by through2 when the write stream has finished
  function onFinish(cb) {
    return Promise.try(function () {
        if (opts.onFinish) {
          return opts.onFinish.call(stream, addFile);
        }
      })
      .then(function () {
        // while we're waiting for promises to finish, we can't call the write
        // finish callback since we may still want to push stuff onto the read
        // stream.  If we call the callback now and there's nothing in the
        // read stream, it'll emit the read 'end' event and we'll be unable to
        // push more data.
        return blockingEnd;
      })
      .all()
      .catch(function (err) {
        stream.emit('error', err);
      })
      .then(function () {
        cb();
      });
  }
};
