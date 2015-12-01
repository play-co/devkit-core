var printf = require('printf');
var path = require('path');
var fs = require('../util/fs');
var mime = require('mime');

var toDataURI = require('../util/datauri').toDataURI;

exports.getFormatsForTarget = function (buildTarget) {
  if (buildTarget === 'browser-mobile') {
    return ['.ttf', '.svg'];
  } else if (buildTarget === 'browser-desktop' || /^native/.test(buildTarget)) {
    // buildTarget.startsWith('native') -- for simulated native builds
    return ['.ttf', '.eot', '.woff'];
  } else {
    // unknown buildTarget? shouldn't ever get here
    console.warn('unexpected buildTarget found when compiling browser fonts:',
                 buildTarget);

    return ['.ttf', '.eot', '.woff', '.svg'];
  }
};

exports.create = function (api, config) {
  var fonts = {};
  var formats = exports.getFormatsForTarget(config.target);

  var validExts = {};
  formats.forEach(function (ext) {
    validExts[ext] = true;
  });

  var fontStream = api.streams.createFileStream({
    onFile: function (file) {
      var ext = file.extname.toLowerCase();
      if (validExts[ext]) {
        fonts[file.basename] = new Font(file);

        // TODO: better font management on native
        if (!/^resources\/fonts\//.test(file.targetRelativePath)) {
          file.moveToDirectory('resources/fonts');
        }
      }
    }
  });

  fontStream.getNames = function () {
    return Object.keys(fonts).map(function (font) {
      return fonts[font].name;
    });
  };

  fontStream.getCSS = function (opts) {
    // Font CSS has to be sorted in proper order: bold and italic
    // version must come *after* the regular version. A standard
    // string sort will take care of this, assuming names like
    //     Ubuntu.ttf
    //     Ubuntu-Bold.ttf
    var values = Object.keys(fonts).map(function (key) {
      return fonts[key];
    });

    values.sort(function (a, b) {
      return a.sortOrder - b.sortOrder;
    });

    var cssOpts = {
      embedFonts: !!opts.embedFonts,
      formats: opts.formats || formats
    };

    return values.map(function (font) {
        return font.getCSS(cssOpts);
      }).join('\n');
  };

  return fontStream;
};

// Convert a font file into a data URI.
function getFontDataURI(loc) {
  try {
    return toDataURI(fs.readFileSync(loc), mime.lookup(loc, 'text/unknown'));
  } catch (e) {
    return '';
  }
}

// Normalize a font type into a set of known types.
function normalizeFontType (type) {
  switch (type) {
    case 'bolditalic':
    case 'italicbold':
    case 'obliquebold':
    case 'boldoblique':
      return 'bolditalic';
    case 'bold':
      return 'bold';
    case 'italic':
    case 'oblique':
      return 'italic';
    default:
      return 'regular';
  }
}

function buildCSSFontString(name, css, formats) {
  var str = printf('\n@font-face{font-family:"%s";', name);

  if (css) {
    str += css + ';';
  }

  var format;
  for (var i = 0; i < formats.length; ++i) {
    format = formats[i];
    if (format && format.src) {
      str += printf('src:url("%s") ', format.src);

      if (format.type) {
        str += printf('format("%s")', format.type);
      }

      str += '; ';
    }

    if (format && format.url) {
      str += printf('src:url("%s");', format.url);
    }
  }

  str += '}';
  return str;
}

// Model a CSS font that we can convert into a CSS file.
var Font = Class(function () {

  var exts = {
    '.svg': 'svg', // IOS < 4.2
    '.eot': '', // IE
    '.ttf': 'truetype', // Everything else?
    '.woff': 'woff',
  };

  this.init = function (file) {
    this.file = file;
    this.basename = path.basename(file.sourcePath, file.extname);
    this.name = this.basename.trim();

    var split = this.name.split(/\-/g);
    if (split.length > 1) {
      var suffix = normalizeFontType(split[1].toLowerCase());

      if (suffix === 'bold') {
        this.weight = 'bold';
        this.sortOrder = 1;
      } else if (suffix === 'italic') {
        this.style = 'italic';
        this.sortOrder = 2;
      } else if (suffix === 'bolditalic') {
        this.weight = 'bold';
        this.style = 'italic';
        this.sortOrder = 3;
      }
    }
  };

  this.getCSS = function (opts) {
    var dirname = path.dirname(this.file.sourcePath);

    var fontData = {};
    Object.keys(exts).forEach(function (ext) {
      var filename = path.join(dirname, this.basename + ext);
      if (opts.embedFonts) {
        fontData[ext] = getFontDataURI(filename);
      } else {
        fontData[ext] = fs.existsSync(filename);
      }
    }, this);

    var css = '';
    if (this.weight) {
      css += 'font-weight:' + this.weight + ';';
    }
    if (this.style) {
      css += 'font-style:' + this.style + ';';
    }

    var formats = [];
    opts.formats.forEach(function (ext) {
      if (fontData[ext]) {
        if (opts.embedFonts) {
          var def = {src: fontData[ext]};
          if (exts[ext]) {
            def.type = exts[ext];
          }

          formats.push(def);
        } else {
          var dirname = path.dirname(this.file.targetRelativePath);
          formats.push({url: path.join(dirname, this.basename + ext)});
        }
      }
    }, this);

    return buildCSSFontString(this.name, css, formats);
  };
});
