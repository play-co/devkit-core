var fs = require('fs');
var crypto = require('crypto');
var path = require('path');
var File = require('vinyl');

// utility function to replace any windows path separators for paths that
// will be used for URLs
var regexSlash = /\\/g;
function useURISlashes (str) { return str.replace(regexSlash, '/'); }

var SpriteSheetList = function () {
  this.sheets = [];
  this.imageMap = {};
  this.sourceMap = {};
};

SpriteSheetList.prototype.merge = function (list) {
  this.addSheets(list.sheets, list.imageMap, list.sourceMap);
  return this;
};

SpriteSheetList.prototype.addSheets = function (sheets, imageMap, sourceMap) {
  this.sheets = this.sheets.concat(sheets);
  this.imageMap = merge(this.imageMap, imageMap);
  this.sourceMap = merge(this.sourceMap, sourceMap);
};

exports.sprite = function (api, app, config, directories) {
  var baseDirectory = config.outputResourcePath;
  var relativeSpritesheetsDirectory = 'spritesheets';
  var spritesheetsDirectory = path.join(baseDirectory,
                                        relativeSpritesheetsDirectory);

  return Promise.resolve(directories)
    .map(function (directory) {
      return exports.spriteDirectory(api, config, directory,
                                     spritesheetsDirectory,
                                     relativeSpritesheetsDirectory);
    }, {concurrency: 1})
    .reduce(function (allSheets, directorySheets) {
      return allSheets.merge(directorySheets);
    }, new SpriteSheetList())
    .then(function (spritesheets) {
      // create map of spritesheets to filenames
      var filename = path.join(spritesheetsDirectory,
                               'spritesheetSizeMap.json');

      var sheetMap = {};
      for (var i in spritesheets.imageMap) {
        var img = spritesheets.imageMap[i];
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

      return {
        sourceMap: spritesheets.sourceMap,
        files: [
          // the image map maps each source image to the name of the
          // spritesheet it was embedded in along with it's location and
          // padding
          new File({
              base: baseDirectory,
              path: path.join(spritesheetsDirectory, 'map.json'),
              contents: new Buffer(JSON.stringify(spritesheets.imageMap))
            }),
          new File({
              base: baseDirectory,
              path: filename,
              contents: new Buffer(JSON.stringify(sheetMap))
            })
        ]
      };

      /*
      return fontsheetMap
        .create(path.join(appPath, 'resources', 'fonts'),
            'resources/fonts')
        .then(function (fontsheet) {
          new File({
            base: baseDirectory,
            path: path.join(baseDirectory, 'resources/fonts/fontsheetSizeMap.json'),
            contents: fontsheet
          });
        });
      */
    });
};

exports.spriteDirectory = function (api, config, directory,
                                    spritesheetsDirectory,
                                    relativeSpritesheetsDirectory) {
  var logger = api.logging.get('spriter');

  var jvmExec = Promise.promisify(api.jvmtools.exec);
  var readFile = Promise.promisify(fs.readFile);

  var spritesheets = new SpriteSheetList();

  return Promise
    .try(function () {
      var md5sum = crypto.createHash('md5');
      md5sum.update(directory.src);
      var hash = md5sum.digest('hex');

      var spriterPngFallback = !!(config.argv
                                  && config.argv['spriter-png-fallback']);
      var cmd = {
        tool: 'spriter',
        args: [
          // don't remove unused spritesheets, since we might be spriting
          // multiple source directories into the same target
          '--no-clean',
          '--cache-file', 'spritercache-' + hash,
          '--scale', 1,
          '--dir', directory.src + '/',
          '--output', spritesheetsDirectory,
          '--target', config.target,
          '--binaries', api.paths.lib,
          '--is-simulator', config.isSimulated,
          '--spriter-png-fallback', spriterPngFallback
        ],
        buffer: true
      };

      logger.log('spriter', cmd.args.map(function (arg) {
            return /^--/.test(arg)
              ? arg
              : '"' + arg + '"';
          })
          .join(' '));

      return jvmExec(cmd);
    })
    .spread(function (stdout /*, stderr */) {
      var spriterOutput = JSON.parse(stdout);

      // If the spriter gives an error, throw
      if (spriterOutput.error) {
        throw spriterOutput.error;
      }

      var sheets = spriterOutput.sprites.map(function (filename) {
        return new File({
          fullPath: path.resolve(spritesheetsDirectory, filename),
          target: path.join(relativeSpritesheetsDirectory, filename)
        });
      });

      var mapPath = path.resolve(spritesheetsDirectory, spriterOutput.map);
      return readFile(mapPath, 'utf8').then(function (mapContents) {
        // rewrite JSON data, fixing slashes and appending the spritesheet
        // directory
        var rawMap = JSON.parse(mapContents);
        var imageMap = {};
        var sourceMap = {};

        Object
          .keys(rawMap)
          .forEach(function (key) {
            if (rawMap[key].sheet) {
              var fullSheetPath = path.join(relativeSpritesheetsDirectory,
                                            rawMap[key].sheet);
              rawMap[key].sheet = useURISlashes(fullSheetPath);
            }

            var targetKey = useURISlashes(path.join(directory.target, key));
            imageMap[targetKey] = rawMap[key];

            var relPath = path.relative(directory.target, key);
            sourceMap[key] = path.join(directory.src, relPath);
          });

        spritesheets.addSheets(sheets, imageMap, sourceMap);
      });
    })
    .then(function () {
      return spritesheets;
    });
};
