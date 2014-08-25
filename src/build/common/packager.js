/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */

var path = require("path");
var fs = require("graceful-fs");
var ff = require("ff");
var spritesheetMap = require("./spritesheetMap");
var fontsheetMap = require("./fontsheetMap");
var spriter = require("./spriter");
var File = require("./File");

// Compile resources together and pass a cache object to the next function.
// runs the spriter and compiles the build code.

// Gather the resources for a specified app, building spritesheets as we go
//   - calls cb(err, res)
//     where res contains:
//       - images: a list of spritesheets
//       - imageMap: JSON map of original image filenames to their location in the spritesheets
//       - other: a list of other resources (json/audio/etc)
// target : string - the build target, e.g. native-ios
// output : string - usually something like "build/debug/native-ios/"

exports.getFiles = function (api, app, config, cb) {
  var logger = api.logging.get('build-browser');

  var appPath = app.paths.root;

  var resourceDirectories = [
      {src: path.join(appPath, 'resources'), target: 'resources'}
    ];

  // sprite any localized resources
  var allFiles = fs.readdirSync(appPath);
  for (var i = 0; i < allFiles.length; i++) {
    try {
      var fileName = allFiles[i];
      var filePath = path.join(appPath, fileName);
      var statInfo = fs.statSync(filePath);
      var localLoc = fileName.indexOf('resources-');
      if (statInfo.isDirectory() && localLoc == 0) {
        resourceDirectories.push({src: filePath, target: fileName});
      }
    } catch (exception) {
      //do nothing if the file stat fails
    }
  }

  // final resources dictionary
  var files = {
      images: [],
      imageMap: {},
      other: []
    };

  // sprite directory
  var relativeSpritesheetsDirectory = "spritesheets";
  var spritesheetsDirectory = path.join(config.outputResourcePath, relativeSpritesheetsDirectory);

  var f = ff(this, function() {
    Object.keys(app.modules).forEach(function (name) {
      var module = app.modules[name];
      var buildPath = module.extensions.build;
      if (!buildPath) { return; }

      var extension = require(buildPath);
      if (!extension.getResourceDirectories) { return; }

      var directories = extension.getResourceDirectories(api, app, config);
      if (!Array.isArray(directories)) { return; }

      directories.forEach(function (directory) {
        console.log(module, directory);
        resourceDirectories.push({
          src: directory.src,
          target: path.join('addons', module.name, directory.target)
        });
      });
    }, this);

    var onFinish = f.wait();

    // which directory are we on (for async loop)
    var currentIndex = 0;

    // sprite all directories and merge results (serially)
    spriteNextDirectory();

    // async loop over all resource directories
    function spriteNextDirectory() {
      var directory = resourceDirectories[currentIndex];
      if (directory) {
        spriter.spriteDirectory(api, config, {
              src: directory.src,
              target: directory.target,
              spritesheets: spritesheetsDirectory,
              spritesheetsTarget: relativeSpritesheetsDirectory
            }, function (err, res) {

          if (err) {
            return onFinish(err);
          }

          // merge results
          files.images = files.images.concat(res.spritesheets);
          files.other = files.other.concat(res.other);

          Object.keys(res.imageMap).forEach(function (key) {
            if (files.imageMap[key]) {
              logger.log("WARNING: multiple images exported with the same name (" + key + "). Only the last image will be included in the build.");
            }
            files.imageMap[key] = res.imageMap[key];
          });

          // next directory
          ++currentIndex;
          spriteNextDirectory();
        });
      } else {
        onFinish();
      }
    }

    fontsheetMap.create(path.join(appPath, "resources", "fonts"), 'resources/fonts', f());
    spritesheetMap.create(files.imageMap, spritesheetsDirectory, "spritesheetSizeMap", f());
  }, function (fontsheet, spritesheetMapPath) {
    files.other.push(new File({
        target: 'resources/fonts/fontsheetSizeMap.json',
        contents: fontsheet
      }));

    files.other.push(new File({
        fullPath: spritesheetMapPath,
        target: path.relative(config.outputResourcePath, spritesheetMapPath)
      }));

    var mapPath = path.join(spritesheetsDirectory, 'map.json');

    // write out the new image map
    fs.writeFile(mapPath, JSON.stringify(files.imageMap), "utf8", f.wait());

    // add to files
    var mapExt = path.extname(mapPath);
    files.other.push(new File({
        fullPath: mapPath,
        target: path.relative(config.outputResourcePath, mapPath)
      }));

    logger.log("Finished packaging resources");
    f(files);

  })
  .cb(cb);
};
