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

    this._minify = opts.minify;

    // divides images during streaming into groups
    this._groups = {};

    // each group needs a unique sheet name
    this._sheetNames = {};

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

  function compressOptsToString(opts) {
    var keys = Object.keys(opts);
    keys.sort();
    return keys
      .map(function (key) {
        return key + ':' + JSON.stringify(opts[key]);
      })
      .join(',');
  }

  function isPowerOfTwoSheets(file) {
    var powerOfTwoSheets = file.getOption('powerOfTwoSheets');
    if (powerOfTwoSheets === undefined) {
      // legacy option is called po2
      powerOfTwoSheets = file.getOption('po2');
    }
    if (powerOfTwoSheets === undefined) {
      // default
      powerOfTwoSheets = this._powerOfTwoSheets;
    }

    return !!powerOfTwoSheets;
  }

  this.addFile = function (file) {
    /**
     * group images based on:
     *   - directory
     *   - file type (jpeg versus png versus png8)
     *   - compression opts
     *   - animation name
     */
    var base = path.basename(file.targetRelativePath);
    var animFrameKey = base.match(IS_ANIMATION_FRAME);
    animFrameKey = animFrameKey && animFrameKey[1] || '';

    var compressOpts = file.getCompressOpts();
    var powerOfTwoSheets = isPowerOfTwoSheets(file);
    var name = path.dirname(file.targetRelativePath).replace(/\//g, '-');

    var key = [
      (powerOfTwoSheets ? 'a' : 'b'),
      compressOpts && compressOptsToString(compressOpts) || '',
      animFrameKey,
      name // must be last
    ].join('-');

    if (!this._groups[key]) {
      // compute a unique sheet name
      var baseName = name + (animFrameKey ? '-' + animFrameKey : '') + '-';
      var i = 0;
      var sheetName = baseName + i;
      while (this._sheetNames[sheetName]) {
        sheetName = baseName + (++i);
      }

      var isJPG = compressOpts && compressOpts.format == 'jpg';

      this._groups[key] = {
        sheetName: sheetName,
        ext: isJPG ? '.jpg' : '.png',
        mime: isJPG ? 'image/jpeg' : 'image/png',
        powerOfTwoSheets: powerOfTwoSheets,
        compress: compressOpts,
        filenames: []
      };
    }

    var fullPath = file.sourcePath;
    var relPath = file.targetRelativePath;
    this._groups[key].filenames.push(fullPath);
    this._filenameMap[fullPath] = relPath;
  };

  this.sprite = function (addFile) {
    return Promise.join(this._cache, mkdirp(this._spritesheetsDirectory), function (cache) {
        return Promise.resolve(Object.keys(this._groups))
          .bind(this)
          .map(function (key) {
            var group = this._groups[key];
            return this._spriteIfNotCached(addFile, cache, key, group);
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
      }.bind(this));
  };

  /**
   * Given a cache, a cache key, and a group, check the cache for a valid value
   * for the key first.  If cache lookup fails, call this._spriteGroup
   */
  this._spriteIfNotCached = function (addFile, cache, key, group) {
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

      addFile({
        filename: 'spritesheets/' + sheet.name,
        // already wrote to disk, so filter this file out before piping
        // to the output stream
        written: true,
        compress: group.compress
      });
    }

    return cache.get(key, group.filenames)
      .bind(this)
      .catch(function (e) {
        if (e instanceof spriter.NotCachedError) {
          return this._runSpriter(addFile, cache, key, group);
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
        return this._runSpriter(addFile, cache, key, group)
          .bind(this)
          .map(onSheet);
      });
  };

  this._runSpriter = function (addFile, cache, key, group) {
    return this._taskQueue.run(path.join(__dirname, 'SpriteTask'), {
        name: group.sheetName,
        spritesheetsDirectory: this._spritesheetsDirectory,
        powerOfTwoSheets: group.powerOfTwoSheets,
        filenames: group.filenames,
        ext: group.ext,
        mime: group.mime
      })
      .tap(function (sheets) {
        // set the cached value for the group key here since we'll be changing
        // the filenames next from file system paths to paths relative to the
        // destination directory (e.g. '/Users/.../game/resources/images/a.png'
        // --> 'resources/images/a.png') and we want to cache the original so we
        // can look it up on disk later to validate the cache
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
