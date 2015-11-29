var SpriterResult = require('./SpriterResult');

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
exports.getStream = function (api, config) {
  var res = new SpriterResult();

  var stream = api.streams.createFileStream({
    onFile: function (file) {
      if ((file.extname in SPRITABLE_EXTS)
          && file.getOption('sprite') !== false) {

        res.setRelativePath(file.sourcePath, file.targetRelativePath);
        res.addUnspritedFile(file.sourcePath, false);
      }
    },
    onFinish: function (addFile) {
      res.addToStream(addFile);
    }
  });

  return stream;
};
