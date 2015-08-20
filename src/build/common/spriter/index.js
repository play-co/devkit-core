var path = require('path');
var spriter = require('devkit-spriter');
var fs = require('fs-extra');
var Promise = require('bluebird');
var mkdirp = Promise.promisify(require('mkdirp'));
var readdir = Promise.promisify(fs.readdir);
var unlink = Promise.promisify(fs.remove);
var TaskQueue = require('../task-queue').TaskQueue;

var SPRITABLE_EXTS = {
  '.jpg': true,
  '.jpeg': true,
  '.png': true,
  '.bmp': true
};

/**
 * Removes spritable image files from a file stream, sprites them, and inserts
 * the sprite map json back into the stream as "map.json".  Since the actual
 * spriting may happen in a separate process and shuffling a lot of binary data
 * is relatively expensive, the sprite task is also responsible for writing the
 * spritesheets to disk.
 *
 * @returns {Stream}
 */
exports.sprite = function (api, outputDirectory) {
  var spriter = new DevKitSpriter(outputDirectory);
  return api.createFilterStream(function (file) {
    if (path.extname(file.path) in SPRITABLE_EXTS
        && file.getOption('sprite') !== false) {
      spriter.addFile(file);
      return api.STREAM_REMOVE_FILE;
    }
  }, function atEnd(addFile, cb) {
    spriter.sprite(addFile, cb);
  });
};

var DevKitSpriter = Class(function () {

  // from timestep.ui.SpriteView
  var IS_ANIMATION_FRAME = /((?:.*)\/.*?)[-_ ](.*?)[-_ ](\d+)/;

  var CACHE_FILENAME = ".devkit-spriter-cache";

  this.init = function (outputDirectory) {
    // where the spritesheets should go
    this._outputDirectory = outputDirectory;

    // divides images during streaming into groups
    this._groups = {};

    // maps file system paths to target directories
    this._filenameMap = {};

    // queue for SpriteTasks, runs in n separate processes
    this._taskQueue = new TaskQueue();

    // disk cache
    this._cache = spriter.loadCache(path.join(outputDirectory, CACHE_FILENAME), outputDirectory);
  };

  this.addFile = function (file) {
    /**
     * group images based on:
     *   - directory
     *   - file type (jpeg versus png versus png8)
     */
    var base = path.basename(file.targetRelativePath);
    var animFrameKey = base.match(IS_ANIMATION_FRAME);
    var isJPG = file.getOption('forceJpeg');
    var isPNG = !isJPG;
    var isPNG8 = isPNG && !!file.getOption('pngquant');
    var key = [
      animFrameKey && animFrameKey[1] || '',
      isJPG ? 'j' : isPNG8 ? '8' : 'p',
      path.dirname(file.targetRelativePath).replace(/\//g, '-') // must be last
    ].join('-');

    if (!this._groups[key]) {
      this._groups[key] = {
        mime: isJPG ? 'image/jpeg' : 'image/png',
        isPNG8: isPNG8,
        isJPG: isJPG,
        filenames: []
      };
    }

    var fullPath = file.history[0];
    var relPath = file.targetRelativePath;
    this._groups[key].filenames.push(fullPath);
    this._filenameMap[fullPath] = relPath;
  };

  this.sprite = function (addFile, cb) {
    // spritesheet map.json
    var sheets = {};

    // legacy spritesheetSizeMap.json
    var sizes = {};

    return Promise.join(this._cache, mkdirp(this._outputDirectory), function (cache) {
        return Promise.resolve(Object.keys(this._groups))
          .bind(this)
          .map(function (name) {
            var group = this._groups[name];
            var filenameMap = this._filenameMap;
            return cache.get(name, group.filenames)
              .bind(this)
              .catch(function (e) {
                if (e.message == 'not cached') {
                  return this._sprite(name, group, cache);
                } else {
                  throw e; // unexpected error?
                }
              })
              .map(function (sheet) {
                sheet.map.d.forEach(function (info) {
                  info.f = filenameMap[info.f];
                });

                sheets[sheet.filename] = sheet.map;
                sizes[sheet.filename] = {
                  w: sheet.map.w,
                  h: sheet.map.h
                };
              });
          })
          .then(function () {
            this._taskQueue.shutdown();
            addFile('spritesheets/map.json', JSON.stringify(sheets));
            addFile('spritesheets/spritesheetSizeMap.json', JSON.stringify(sizes));
            return [
              this._cleanup(this._outputDirectory, sheets),
              cache.save()
            ];
          })
          .all();
      }.bind(this))
      .nodeify(cb);
  };

  this._sprite = function (name, group, cache) {
    return this._taskQueue.run(path.join(__dirname, 'SpriteTask'), {
      name: name,
      outputDirectory: this._outputDirectory,
      filenames: group.filenames,
      mime: group.mime
    })
    .tap(function (rawSheets) {
      cache.set(name, rawSheets);
    });
  };

  this._cleanup = function (directory, sheets) {
    var validNames = {
      'map.json': true,
      'spritesheetSizeMap.json': true
    };

    validNames[CACHE_FILENAME] = true;

    Object.keys(sheets).forEach(function (filename) {
      validNames[filename] = true;
    });
    return readdir(directory)
      .map(function (filename) {
        if (!(filename in validNames)) {
          console.log(" --- removing spritesheets/" + filename);
          return unlink(path.join(directory, filename));
        }
      });
  };
});
