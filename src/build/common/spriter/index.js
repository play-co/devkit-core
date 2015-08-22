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
exports.sprite = function (api, config) {
  var spriter = new DevKitSpriter(config.spritesheetsDirectory, {
    powerOfTwoSheets: config.powerOfTwoSheets
  });

  return api.streams.createFileStream({
    onFile: function (file) {
      if ((file.extname in SPRITABLE_EXTS)
          && file.getOption('sprite') !== false) {
        spriter.addFile(file);
        return api.streams.REMOVE_FILE;
      }
    },
    onEnd: function (addFile) {
      return spriter.sprite(addFile);
    }
  });
};

var DevKitSpriter = Class(function () {

  // from timestep.ui.SpriteView
  var IS_ANIMATION_FRAME = /((?:.*)\/.*?)[-_ ](.*?)[-_ ](\d+)/;

  var CACHE_FILENAME = ".devkit-spriter-cache";

  this.init = function (spritesheetsDirectory, opts) {
    // where the spritesheets should go
    this._spritesheetsDirectory = spritesheetsDirectory;

    this._powerOfTwoSheets = opts.powerOfTwoSheets;

    // divides images during streaming into groups
    this._groups = {};

    // maps file system paths to target directories
    this._filenameMap = {};

    // queue for SpriteTasks, runs in n separate processes
    this._taskQueue = new TaskQueue();

    // disk cache
    this._cache = spriter.loadCache(path.join(spritesheetsDirectory, CACHE_FILENAME), spritesheetsDirectory);

    // resulting spritesheets indexed by name for map.json
    this._sheets = {};

    // sizes - storage for legacy spritesheetSizeMap.json
    this._sizes = {};

  };

  this.addFile = function (file) {
    /**
     * group images based on:
     *   - directory
     *   - file type (jpeg versus png versus png8)
     */
    var base = path.basename(file.targetRelativePath);
    var animFrameKey = base.match(IS_ANIMATION_FRAME);
    animFrameKey = animFrameKey && animFrameKey[1] || '';
    var isJPG = file.getOption('forceJpeg');
    var isPNG = !isJPG;
    var isPNG8 = isPNG && !!file.getOption('pngquant');
    var powerOfTwoSheets = file.getOption('po2');
    if (powerOfTwoSheets === undefined) { powerOfTwoSheets = this._powerOfTwoSheets; }
    var name = path.dirname(file.targetRelativePath).replace(/\//g, '-');

    var key = [
      (powerOfTwoSheets ? 'a' : 'b'),
      (isJPG ? 'j' : isPNG8 ? '8' : 'p'),
      animFrameKey,
      name // must be last
    ].join('-');

    if (!this._groups[key]) {
      this._groups[key] = {
        sheetName: name + (animFrameKey ? '--' + animFrameKey : ''),
        mime: isJPG ? 'image/jpeg' : 'image/png',
        isPNG8: isPNG8,
        isJPG: isJPG,
        powerOfTwoSheets: powerOfTwoSheets,
        filenames: []
      };
    }

    var fullPath = file.history[0];
    var relPath = file.targetRelativePath;
    this._groups[key].filenames.push(fullPath);
    this._filenameMap[fullPath] = relPath;
  };

  this.sprite = function (addFile, cb) {
    return Promise.join(this._cache, mkdirp(this._spritesheetsDirectory), function (cache) {
        return Promise.resolve(Object.keys(this._groups))
          .bind(this)
          .map(function (key) {
            var group = this._groups[key];
            return this._spriteGroupCached(key, group, cache);
          })
          .then(function () {
            this._taskQueue.shutdown();

            addFile({
              filename: 'spritesheets/map.json',
              contents: JSON.stringify(this._sheets)
            });

            addFile({
              filename: 'spritesheets/spritesheetSizeMap.json',
              contents: JSON.stringify(this._sizes),
              inline: false
            });

            return [
              this._cleanup(),
              cache.save()
            ];
          })
          .all();
      }.bind(this))
      .nodeify(cb);
  };

  this._spriteGroupCached = function (key, group, cache) {
    var filenameMap = this._filenameMap;

    function onSheet(sheet) {
      sheet.sprites.forEach(function (info) {
        info.f = filenameMap[info.f];
      });

      this._sheets[sheet.name] = sheet.sprites;
      this._sizes[sheet.name] = {
        w: sheet.width,
        h: sheet.height
      };
    }

    return cache.get(key, group.filenames)
      .bind(this)
      .catch(function (e) {
        if (e instanceof spriter.NotCachedError) {
          return this._spriteGroup(key, group, cache);
        } else {
          throw e; // unexpected error?
        }
      })
      .map(onSheet)
      .catch(function () {
        // a first error is probably an invalid cache file -- try respriting
        // before giving up
        console.warn('spritesheet cache value may be invalid');
        cache.remove(key);
        return this._spriteGroup(key, group, cache)
          .bind(this)
          .map(onSheet);
      });
  };

  this._spriteGroup = function (key, group, cache) {
    return this._taskQueue.run(path.join(__dirname, 'SpriteTask'), {
        name: group.sheetName,
        spritesheetsDirectory: this._spritesheetsDirectory,
        powerOfTwoSheets: group.powerOfTwoSheets,
        filenames: group.filenames,
        mime: group.mime
      })
      .tap(function (sheets) {
        cache.set(key, sheets);
      });
  };

  this._cleanup = function () {
    var validNames = {
      'map.json': true,
      'spritesheetSizeMap.json': true
    };

    validNames[CACHE_FILENAME] = true;

    Object.keys(this._sheets).forEach(function (filename) {
      validNames[filename] = true;
    });

    var directory = this._spritesheetsDirectory;
    return readdir(directory)
      .map(function (filename) {
        if (!(filename in validNames)) {
          console.log("removing spritesheets/" + filename);
          return unlink(path.join(directory, filename));
        }
      });
  };
});
