'use strict';
var path = require('path');

var Promise = require('bluebird');
const _ = require('lodash');

var spriter = require('devkit-spriter');
var fs = require('../../util/fs');
var TaskQueue = require('../../task-queue').TaskQueue;
var getCacheFilePath = require('../../DiskCache').getCacheFilePath;

var SpriterResult = require('./SpriterResult');

var SPRITABLE_EXTS = {
  '.jpg': true,
  '.jpeg': true,
  '.png': true,
  '.bmp': true
};

var CACHE_FILENAME = "devkit-spriter";
var LOW_RES_KEY = '__dk_low_res';



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
  var stream;

  let runSpriter = true;
  // When in simulator
  if (config.simulator.deviceId) {
    runSpriter = _.get(
      config.manifest,
      'devkit-core.spriter.runForSimulator',
      true
    );
  }

  const logger = api.logging.get('spriter');
  if (runSpriter) {
    logger.log('Running spriter');
    var spriter = new DevKitSpriter(config.spritesheetsDirectory, {
      powerOfTwoSheets: config.powerOfTwoSheets,
      cacheFile: getCacheFilePath(config, CACHE_FILENAME),
      removeUnusedSheets: config.removeUnusedSheets,
      logger: logger
    });

    if (config.spritesheets) {
      logger.log('reusing previous spriter result');
      spriter.reuseSheets(config.spritesheets);
    }

    stream = api.streams.createFileStream({
      onFile: function (file) {
        if ((file.extname in SPRITABLE_EXTS)
            && file.getOption('sprite') !== false) {
          spriter.addFile(file);
          return api.streams.REMOVE_FILE;
        }
      },
      onFinish: function (addFile) {
        return spriter.sprite(addFile)
          .then(function () {
            api.build.addResult('spritesheets', spriter.getResult());
          });
      }
    });

    stream.spriter = spriter;
  } else {
    logger.log('Skipping spriter');
    stream = require('./skip-spriter').getStream(api, config);
  }

  return stream;
};

function scaleToString(scales) {
  var filenames = Object.keys(scales);
  filenames.sort();

  return filenames
    .map(function (filename) {
      return JSON.stringify(filename) + JSON.stringify(scales[filename]);
    })
    .join('');
}

var Group = Class(function () {
  this.init = function (key, sheetName, compressOpts) {
    this.key = key;
    this.sheetName = sheetName;
    this.compress = compressOpts;
    this.scale = {};
    this.filenames = [];

    var isJPG = compressOpts && compressOpts.format == 'jpg';
    this.ext = isJPG ? '.jpg' : '.png';
    this.mime = isJPG ? 'image/jpeg' : 'image/png';
  };

  this.addFile = function (file, isLowRes) {
    var fullPath = file.sourcePath;
    var scale = file.getOption('scale') || 1;
    var scaleLowRes = file.getOption('scaleLowRes');

    if (isLowRes) {
      scale = scaleLowRes || scale / 2;
    }

    if (scale !== 1) {
      this.scale[fullPath] = scale;
    }

    this.filenames.push(fullPath);
  };
});

var DevKitSpriter = Class(function () {

  // from timestep.ui.SpriteView
  var IS_ANIMATION_FRAME = /((?:.*)\/.*?)[-_ ](.*?)[-_ ](\d+)/;

  this.init = function (spritesheetsDirectory, opts) {
    // where the spritesheets should go
    this._spritesheetsDirectory = spritesheetsDirectory;

    this._removeUnusedSheets = opts.removeUnusedSheets;

    this._powerOfTwoSheets = opts.powerOfTwoSheets;

    this._logger = opts.logger;

    this._minify = opts.minify;

    // divides images during streaming into groups
    this._groups = {};

    // each group needs a unique sheet name
    this._sheetNames = {};
    this._sheetNamesLowRes = {};

    this._result = new SpriterResult();

    // queue for SpriteTasks, runs in n separate processes
    this._taskQueue = new TaskQueue();

    // disk cache
    if (opts.cacheFile) {
      this._getCache = fs.mkdirsAsync(path.dirname(opts.cacheFile))
        .bind(this)
        .then(function () {
          return spriter.loadCache(opts.cacheFile);
        });
    }

    // set to true if reusing the spritesheets from a different build
    this._skipSpriting = false;
  };

  this.getResult = function () {
    return this._result.toJSON();
  };

  this.reuseSheets = function (previousResult) {
    this._skipSpriting = true;
    this._result.update(previousResult);
  };

  this.getSizes = function () { return this._result.toJSON().sizes; };

  this._compressOptsToString = function (opts) {
    var keys = Object.keys(opts);
    keys.sort();
    return keys
      .map(function (key) {
        return key + ':' + JSON.stringify(opts[key]);
      })
      .join(',');
  };

  this._isPowerOfTwoSheets = function (file) {
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
  };

  this._getUniqueSheetName = function (name, animFrameKey, isLowRes) {
    // compute a unique sheet name
    var baseName = name + (animFrameKey ? '-' + animFrameKey : '');
    var sheetName = baseName;
    var sheetNames = this._sheetNames;
    var i = 0;

    if (isLowRes) {
      sheetNames = this._sheetNamesLowRes;
    }

    while (sheetNames[sheetName]) {
      sheetName = baseName + '-' + (++i).toString(36);
    }

    sheetNames[sheetName] = true;

    if (isLowRes) {
      sheetName += LOW_RES_KEY;
    }

    return sheetName;
  };

  this.addFile = function (file) {
    /**
     * group images based on:
     *   - directory
     *   - file type (jpeg versus png versus png8)
     *   - compression opts
     *   - animation name
     *   - group name opts
     */
    var base = path.basename(file.targetRelativePath);
    var animFrameKey = base.match(IS_ANIMATION_FRAME);
    animFrameKey = animFrameKey && animFrameKey[1] || '';

    var compressOpts = file.getCompressOpts();
    var powerOfTwoSheets = this._isPowerOfTwoSheets(file);

    var name = file.getOption('group') ||
      path.dirname(file.targetRelativePath).replace(/\//g, '-');

    var key = [
      (powerOfTwoSheets ? 'a' : 'b'),
      compressOpts && this._compressOptsToString(compressOpts) || '',
      animFrameKey,
      name // must be last
    ].join('-');

    if (!this._groups[key]) {
      var sheetName = this._getUniqueSheetName(name, animFrameKey, false);
      this._groups[key] = new Group(key, sheetName, compressOpts);
    }

    this._groups[key].addFile(file, false);
    this._result.setRelativePath(file.sourcePath, file.targetRelativePath);

    /**
     * Create a set of low resolution sheets
     * TODO: this should only occur with an option set, and for release builds
     */

    var keyLowRes = key + LOW_RES_KEY;
    var groupLowRes = this._groups[keyLowRes];

    if (!groupLowRes) {
      var sheetNameLowRes = this._getUniqueSheetName(name, animFrameKey, true);
      this._groups[keyLowRes] = groupLowRes = new Group(keyLowRes, sheetNameLowRes, compressOpts);
    }

    groupLowRes.addFile(file, true);
    this._result.setRelativePath(
      file.sourcePath.replace(groupLowRes.ext, LOW_RES_KEY + groupLowRes.ext),
      file.targetRelativePath.replace(groupLowRes.ext, LOW_RES_KEY + groupLowRes.ext));
  };

  this.sprite = function (addFile) {
    return this._getCache
      .then(function (cache) {
        if (!this._skipSpriting) {
          return fs.mkdirsAsync(this._spritesheetsDirectory)
            .bind(this)
            .then(function () {
              return Object.keys(this._groups);
            })
            .map(function (key) {
              var group = this._groups[key];
              return this._spriteIfNotCached(addFile, cache, key, group);
            })
            .then(function () {
              return [
                this._removeUnusedSheets && this._cleanup(),
                cache && cache.save()
              ];
            })
            .all()
            .finally(function () {
              this._taskQueue.shutdown();
            });
        }
      })
      .then(function () {
        this._result.addToStream(addFile);
      });
  };

  /**
   * Given a cache, a cache key, and a group, check the cache for a valid value
   * for the key first.  If cache lookup fails, call this._spriteGroup
   */
  this._spriteIfNotCached = function (addFile, cache, key, group) {
    if (!cache) {
      return this._runSpriter(addFile, cache, key, group);
    }

    var cached = cache.get(key) || {};
    return spriter.verifySheets(this._spritesheetsDirectory, group.filenames, cached.mtimes, cached.spritesheets)
      .bind(this)
      .then(function () {
        if (cached.scale !== scaleToString(group.scale)) {
          throw new spriter.NotCachedError(key + ': scales do not match');
        }

        return cached;
      })
      .catch(function (e) {
        if (e instanceof spriter.NotCachedError) {
          // update cached mtimes if we got new ones
          if (e.mtimes) {
            cached.mtimes = e.mtimes;
          }

          this._logger.info('not-cached', key, e.message);
          return this._runSpriter(addFile, cache, key, group);
        } else {
          throw e; // unexpected error
        }
      })
      .then(onResult)
      .catch(function (e) {
        // a first error is probably an invalid cache file -- try respriting
        // before giving up
        this._logger.warn('spritesheet cache value may be invalid', e);
        cache.remove(key);
        return this._runSpriter(addFile, cache, key, group)
          .bind(this)
          .then(onResult);
      });

    function onResult (res) {
      res.spritesheets.map(this._result.addSheet.bind(this._result));
      res.unspritable.forEach(function (filename) {
        this._result.addUnspritedFile(filename, true);
      }, this);
    }
  };

  this._runSpriter = function (addFile, cache, key, group) {
    return this._taskQueue.run(path.join(__dirname, 'SpriteTask'), {
        name: group.sheetName,
        spritesheetsDirectory: this._spritesheetsDirectory,
        powerOfTwoSheets: group.powerOfTwoSheets,
        filenames: group.filenames,
        compress: group.compress,
        scale: group.scale,
        ext: group.ext,
        mime: group.mime
      })
      .tap(function (res) {
        // set the cached value for the group key here since we'll be changing
        // the filenames next from file system paths to paths relative to the
        // destination directory (e.g. '/Users/.../game/resources/images/a.png'
        // --> 'resources/images/a.png') and we want to cache the original so we
        // can look it up on disk later to validate the cache
        var cached = cache.get(key);
        cached.spritesheets = res.spritesheets;
        cached.unspritable = res.unspritable;
        cached.scale = scaleToString(group.scale);
      });
  };

  this._cleanup = function () {
    var validNames = {
      'map.json': true,
      'spritesheetSizeMap.json': true
    };

    validNames[CACHE_FILENAME] = true;

    Object.keys(this.getResult().sheets).forEach(function (filename) {
      validNames[filename] = true;
    });

    var directory = this._spritesheetsDirectory;
    return fs.readdirAsync(directory)
      .map(function (filename) {
        var relativePath = 'spritesheets/' + filename;
        if (!(relativePath in validNames)) {
          console.log('removing', relativePath);
          return fs.removeAsync(path.join(directory, filename));
        }
      });
  };
});
