var sizeOf = require('image-size');

module.exports = SpriterResult;

function SpriterResult () {
  // maps file system paths to target directories
  this._relativePaths = {};

  // spritesheet sizes indexed by name for legacy spritesheetSizeMap.json
  this._sizes = {};

  // resulting spritesheets indexed by name for map.json
  this._sheets = {};

  // tracks files that can be added to a stream later with addFile
  this._files = [];
}

SpriterResult.prototype.update = function (sheets, sizes) {
  var key;
  if (sheets) {
    for (key in sheets) {
      this._sheets[key] = sheets[key];
    }
  }

  if (sizes) {
    for (key in sizes) {
      this._sizes[key] = sizes[key];
    }
  }
};

SpriterResult.prototype.setRelativePath = function (source, relativePath) {
  this._relativePaths[source] = relativePath;
};

SpriterResult.prototype.addSheet = function (sheet) {

  // convert sheet data to relative paths
  var sprites = sheet.sprites.map(function (info) {
    var out = {};
    for (var key in info) {
      out[key] = info[key];
    }
    out.f = this._relativePaths[info.f];
    return out;
  }, this);

  this._sheets[sheet.name] = sprites;
  this._sizes[sheet.name] = {
    w: sheet.width,
    h: sheet.height
  };

  this._files.push({
      filename: 'spritesheets/' + sheet.name,
      // already wrote to disk, so filter this file out before piping
      // to the output stream
      written: true
    });
};

SpriterResult.prototype.addUnspritedFile = function (filename) {
  // the async version runs a lot slower, so we're going to stick with
  // sync for now???
  var relativePath = this._relativePaths[filename];
  var dimensions = sizeOf(filename);
  this._sheets[relativePath] = [{
      f: relativePath,
      w: dimensions.width,
      h: dimensions.height
    }];

  this._sizes[relativePath] = {
      w: dimensions.width,
      h: dimensions.height
    };

  // file was removed from stream earlier, but we didn't sprite it, so add it
  // back (copy to build)
  this._files.push(filename);
};

SpriterResult.prototype.addToStream = function (addFile) {
  this._files.forEach(function (opts) {
    addFile(opts);
  });

  addFile({
    filename: 'spritesheets/map.json',
    contents: JSON.stringify(this._sheets)
  });

  addFile({
    filename: 'spritesheets/spritesheetSizeMap.json',
    contents: JSON.stringify(this._sizes),
    inline: false
  });
};

SpriterResult.prototype.toJSON = function () {
  return {
      sheets: this._sheets,
      sizes: this._sizes
    };
};
