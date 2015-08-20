var devkitSpriter = require('devkit-spriter');
var path = require('path');
var fs = require('graceful-fs');
var Promise = require('bluebird');
var writeFile = Promise.promisify(fs.writeFile);

exports.run = function (opts) {
  return devkitSpriter.loadImages(opts.filenames)
    .then(function (images) {
      return devkitSpriter.sprite(images, opts);
    })
    .map(function (spritesheet) {
      var filename = spritesheet.name;
      return spritesheet.composite().buffer.getBuffer(opts.mime)
        .then(function (buffer) {
          spritesheet.recycle();
          return writeFile(path.join(opts.spritesheetsDirectory, filename), buffer)
            .return(spritesheet.toJSON());
        });
    });
};
