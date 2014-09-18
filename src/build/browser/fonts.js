var printf = require('printf');
var path = require('path');
var fs = require('fs');
var mime = require('mime');

var toDataURI = require('./datauri').toDataURI;

var exts = {
  '.ttf': true,
  '.svg': false,
  '.eot': true,
  '.woff': true
};

exports.getFormatsForTarget = function (buildTarget) {
  if (buildTarget == 'browser-mobile') {
    return ['.ttf', '.svg'];
  } else if (buildTarget == 'browser-desktop' || /^native/.test(buildTarget)) {
    // buildTarget.startsWith('native') -- for simulated native builds
    return ['.ttf', '.eot', '.woff'];
  } else {
    // unknown buildTarget? shouldn't ever get here
    console.warn("unexpected buildTarget found when compiling browser fonts:", buildTarget);
    return ['.ttf', '.eot', '.woff', '.svg'];
  }
}

exports.CSSFontList = Class(function () {
  this.init = function () {
    this._fonts = {};
  }

  this.addFiles = function (files, cb) {
    for (var i = 0, n = files.length; i < n; ++i) {
      var file = files[i];
      if (exts[file.ext.toLowerCase()]) {
        this.add(file.fullPath);
      }
    }

    cb && cb();
  }

  this.add = function (fontPath) {
    this._fonts[path.basename(fontPath)] = new CSSFont(fontPath);
  }

  this.getNames = function () {
    return Object.keys(this._fonts).map(function (font) {
      return this._fonts[font].name;
    }, this);
  }

  this.getCSS = function (opts) {
    // Font CSS has to be sorted in proper order: bold and italic
    // version must come *after* the regular version. A standard
    // string sort will take care of this, assuming names like
    //     Ubuntu.ttf
    //     Ubuntu-Bold.ttf
    var fonts = Object.keys(this._fonts).map(function (key) {
      return this._fonts[key];
    }, this);

    fonts.sort(function (a, b) {
      return a.sortOrder - b.sortOrder;
    });

    return fonts.map(function (font) {
        return font.getCSS(opts);
      }).join('\n');
  }
});

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

  if (css) str += css + ';';

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
var CSSFont = Class(function () {

  var exts = {
    '.svg': 'svg', // IOS < 4.2
    '.eot': '', // IE
    '.ttf': 'truetype', // Everything else?
    '.woff': 'woff',
  };

  this.init = function (file) {
    this.file = file;
    this.fileBase = path.basename(file, path.extname(file));

    this.name = this.fileBase.trim();

    var split = this.name.split(/\-/g);
    if (split.length > 1) {
      this.name = split[0];

      var suffix = normalizeFontType(split[1].toLowerCase());

      if (suffix == 'bold') {
        this.weight = 'bold';
        this.sortOrder = 1;
      } else if (suffix == 'italic') {
        this.style = 'italic';
        this.sortOrder = 2;
      } else if (suffix == 'bolditalic') {
        this.weight = 'bold';
        this.style = 'italic';
        this.sortOrder = 3;
      }
    }
  }

  this.getCSS = function (opts) {
    var fileBase = this.fileBase;
    var dirname = path.dirname(this.file);

    var fontData = {};
    Object.keys(exts).forEach(function (ext) {
      fontData[ext] = getFontDataURI(path.join(dirname, fileBase + ext));
    }, this);

    var css = '';
    if (this.weight != null) {
      css += 'font-weight:' + this.weight + ';';
    }
    if (this.style != null) {
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
          formats.push({url: 'resources/fonts/' + fileBase + ext});
        }
      }
    }, this);

    return buildCSSFontString(this.name, css, formats);
  }
});
