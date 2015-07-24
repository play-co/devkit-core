
var path = require('path');
var glob = Promise.promisify(require('glob'));
var File = require('vinyl');
var sizeOf = require('image-size');

var spritePattern  = /((?:.*)\/.*?)[-_ ](.*?)[-_ ](\d+)/;
var allowedPattern = /\.png$|\.jpg$|\.jpeg$/;

// TODO: implement source map
exports.sprite = function (api, app, config, directories) {
  var baseDirectory = config.outputResourcePath;
  var relativeSpritesheetsDirectory = 'spritesheets';
  var spritesheetsDirectory = path.join(baseDirectory,
                                relativeSpritesheetsDirectory);

  var sheetMap = {};
  var sourceMap = {};

  return Promise.resolve(directories)
    .map(exports.spriteDirectory.bind(exports, api, config))
    .each(function (allFiles) {
      allFiles.forEach(function(file) {
        // TODO: Put all the files in to a single object, then return it
        if (file.info) {
          sheetMap[file.target] = file.info;
        }

        sourceMap[file.originalRelativePath] = true;
      });
    })
    .then(function () {
      // Needs to return: sourceMap{}, files[]
      var obj = {
        files: [
          new File({
            base: baseDirectory,
            path: path.join(spritesheetsDirectory,
                    'map.json'),
            contents: new Buffer(JSON.stringify(sheetMap))
          })
        ],
        sourceMap: sourceMap
      };
      return obj;
    });
};

/** Walk the dir, get all the sprite files */
exports.spriteDirectory = function (api, config, directory) {
  var files = [];

  var root = directory.src;
  return glob('**/*', {cwd: root, nodir: true})
    .map(function (filename) {

      if (!allowedPattern.exec(filename)) {
        return;
      }

      var srcPath = path.join(root, filename);
      // var relativeRoot = root.substring(directory.src.length + 1, root.length);
      var target = path.join(directory.target, filename);

      var fileData = {
        src: srcPath,
        target: target,
        originalRelativePath: filename,
        info: exports.makeInfoFor(srcPath, target)
      };

      files.push(fileData);
    })
    .then(function() {
      return files;
    });
};

/** Make a spritesheets/map.json info object for this path */
exports.makeInfoFor = function(path, target) {
  var dimensions = sizeOf(path);

  var info = {
    w: dimensions.width,
    h: dimensions.height
  };

  return info;
};
