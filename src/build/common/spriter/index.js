var path = require('path');
var mkdirp = Promise.promisify(require('mkdirp'));
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

  this.init = function (outputDirectory) {
    // where the spritesheets should go
    this._outputDirectory = outputDirectory;

    // divides images during streaming into groups
    this._groups = {};

    // maps file system paths to target directories
    this._filenameMap = {};

    // queue for SpriteTasks, runs in n separate processes
    this._taskQueue = new TaskQueue();
  };

  this.addFile = function (file) {
    /**
     * group images based on:
     *   - directory
     *   - file type (jpeg versus png versus png8)
     */
    var base = path.basename(file.originalRelativePath);
    var animFrameKey = base.match(IS_ANIMATION_FRAME);
    var isJPG = file.getOption('forceJpeg');
    var isPNG = !isJPG;
    var isPNG8 = isPNG && !!file.getOption('pngquant');
    var key = [
      animFrameKey && animFrameKey[1] || '',
      isJPG ? 'j' : isPNG8 ? '8' : 'p',
      path.dirname(file.originalRelativePath).replace(/\//g, '-') // must be last
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
    // spritesheet map json
    var sheets = {};

    // legacy spritesheetSizeMap
    var sizes = {};
    Promise.resolve(Object.keys(this._groups))
      .bind(this)
      .tap(function () {
        return mkdirp(this._outputDirectory);
      })
      .map(function (name) {
        var group = this._groups[name];
        var filenameMap = this._filenameMap;
        return this._taskQueue.run(path.join(__dirname, 'SpriteTask'), {
            name: name,
            outputDirectory: this._outputDirectory,
            filenames: group.filenames,
            mime: group.mime
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
        addFile('spritesheets/map-v2.json', JSON.stringify(sheets));
        addFile('spritesheets/spritesheetSizeMap.json', JSON.stringify(sizes));
      })
      .nodeify(cb);
  };
});
