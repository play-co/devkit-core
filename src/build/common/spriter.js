var path = require('path');
var fs = require('graceful-fs');
var devkitSpriter = require('devkit-spriter');

// utility function to replace any windows path separators for paths that
// will be used for URLs
var regexSlash = /\\/g;
function useURISlashes (str) { return str.replace(regexSlash, '/'); }

var SpritesheetSet = function () {
  this.sheets = [];
  this.imageMap = {};
  this.sourceMap = {};
};

SpritesheetSet.prototype.merge = function (list) {
  this.addSheets(list.sheets, list.imageMap, list.sourceMap);
  return this;
};

SpritesheetSet.prototype.addSheets = function (sheets, imageMap, sourceMap) {
  this.sheets = this.sheets.concat(sheets);
  this.imageMap = merge(this.imageMap, imageMap);
  this.sourceMap = merge(this.sourceMap, sourceMap);
};

SpritesheetSet.prototype.getImageMap = function () {
  return this.imageMap;
};

SpritesheetSet.prototype.getSourceMap = function () {
  return this.sourceMap;
};

SpritesheetSet.prototype.getSheetMap = function () {
  // create map of spritesheets to filenames
  var sheetMap = {};
  for (var i in this.imageMap) {
    var img = this.imageMap[i];
    if (!img || !img.sheet) {
      continue;
    }

    var sheet = img.sheet;
    if (!sheetMap[sheet]) {
      sheetMap[sheet] = {
        w: img.sheetSize[0],
        h: img.sheetSize[1]
      };
    }
  }

  return sheetMap;
};

var SPRITABLE_EXTS = {
  '.jpg': true,
  '.jpeg': true,
  '.png': true,
  '.bmp': true
};

// from timestep.ui.SpriteView
var IS_ANIMATION_FRAME = /((?:.*)\/.*?)[-_ ](.*?)[-_ ](\d+)/;

exports.sprite = function (api, outputDirectory) {
  var groups = {};
  var filenameMap = {};

  function addToGroup(file) {
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

    if (!groups[key]) {
      groups[key] = {
        format: isJPG ? 'image/jpeg' : 'image/png',
        isPNG8: isPNG8,
        isJPG: isJPG,
        filenames: []
      };
    }

    var fullPath = file.history[0];
    var relPath = file.targetRelativePath;
    groups[key].filenames.push(fullPath);
    filenameMap[fullPath] = relPath;
  }

  return api.createFilterStream(function (file) {
    if (path.extname(file.path) in SPRITABLE_EXTS
        && file.getOption('sprite') !== false) {
      addToGroup(file);
      return api.STREAM_REMOVE_FILE;
    }
  }, function atEnd(addFile, cb) {
    // spritesheet map json
    var sheets = {};

    // legacy spritesheetSizeMap
    var sizes = {};
    var inProgress = 0;
    Promise.resolve(Object.keys(groups))
      .bind(this)
      .map(function (name) {
        inProgress++;
        var group = groups[name];
        return runTaskRemote({
            id: 'sprite',
            name: name,
            outputDirectory: outputDirectory,
            filenames: group.filenames,
            format: group.format
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

            // if (res.buffer) {
            //   addFile('spritesheets/' + res.filename, res.buffer);
            // }
          });
      })
      .then(function () {
        addFile('spritesheets/map-v2.json', JSON.stringify(sheets));
        addFile('spritesheets/spritesheetSizeMap.json', JSON.stringify(sizes));
      })
      .nodeify(cb);
  });
};

function sprite(name, filenames, format, outputDirectory) {
  return devkitSpriter.loadImages(filenames)
    .then(function (images) {
      return devkitSpriter.sprite(name, images);
    })
    .map(function (spritesheet) {
      var filename = spritesheet.name + (format == 'images/jpeg' ? '.jpg' : '.png');

      return spritesheet.composite().buffer.getBuffer(format)
        .then(function (buffer) {
          spritesheet.recycle();
          fs.writeFile(path.join(outputDirectory, filename), buffer);
          return {
            filename: filename,
            map: spritesheet.toJSON()
          };
        });
    });
}

function runTaskLocal(task) {
  if (task.id == 'sprite') {
    return sprite(task.name, task.filenames, task.format, task.outputDirectory);
  } else if (task.id == 'exit') {
    process.exit();
  }
}

var _taskQueue;
function runTaskRemote(task) {
  if (!_taskQueue) {
    _taskQueue = new (require('./TaskQueue'))(__filename);
  }

  return _taskQueue.runTask(task);
}

function workerProcess() {
  process.on('message', function (evt) {
    var id = evt.id;
    var task = evt.task;
    runTaskLocal(task)
      .then(function (res) {
        process.send({
          id: id,
          res: res
        });
      });
  });
}

if (require.main === module) {
  workerProcess();
}
