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

var imageSize = require('image-size');
var fs = require('graceful-fs');
var ff = require('ff');
var path = require('path');

exports.create = function(fontsDir, targetDir, cb) {
  var f = ff(function () {
    fs.exists(fontsDir, f.slotPlain());
  }, function (exists) {
    if (!exists) {
      f([]);
    } else {
      fs.readdir(fontsDir, f());
    }
  }, function (files) {
    var fontsheetMap = {};
    files.filter(function(filename) {
      return /\.png$/i.test(filename);
    }).forEach(function(filename) {
      var cb = f.wait();
      var fullPath = path.join(fontsDir, filename);
      var targetPath = path.join(targetDir, filename);
      imageSize(fullPath, function (err, dimensions) {
        fontsheetMap[targetPath] = {
          w: dimensions.width,
          h: dimensions.height
        };

        cb();
      });
    });

    f(fontsheetMap);
  }).cb(cb);
};
