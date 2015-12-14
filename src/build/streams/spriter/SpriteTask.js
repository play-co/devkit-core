var devkitSpriter = require('devkit-spriter');
var path = require('path');
var fs = require('graceful-fs');
var Promise = require('bluebird');
var writeFile = Promise.promisify(fs.writeFile);

exports.run = function (opts) {
  var unspritable = [];
  return devkitSpriter.loadImages(opts.filenames, opts.scale)
    .then(function (res) {
      if (res.errors) {
        for (var filename in res.errors) {
          console.error(res.errors[filename]);
          unspritable.push(filename);
        }
      }

      return devkitSpriter.sprite(res.images, opts);
    })
    .map(function (spritesheet) {
      var filename = spritesheet.name;
      var isJPG = opts.mime == 'image/jpeg';
      var quality = opts.compress && opts.compress.quality;
      var image = spritesheet.composite().buffer;
      if (isJPG && quality) {
        if (typeof quality == 'string') {
          console.warn('[warn] quality should be a number, but is a string:', opts.compress);
          quality = parseFloat(quality);
        }

        image.quality(quality);
      }
      return image.getBuffer(opts.mime)
        .then(function (buffer) {
          spritesheet.recycle();
          return writeFile(path.join(opts.spritesheetsDirectory, filename), buffer)
            .return(spritesheet.toJSON());
        });
    })
    .then(function (spritesheetInfo) {
      return {
        spritesheets: spritesheetInfo,
        unspritable: unspritable
      };
    });
};
