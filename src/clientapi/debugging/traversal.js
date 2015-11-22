/**
 * @license
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

/*
 * debug tools for traversing views from the JS console.
 * This class ends up being in the global scope:
 *   GLOBAL._DEBUG = new exports();
 */

/* globals GC, bind, logger */

exports.traverse = function (f) { return GC.app && exports.traverseView(f, GC.app.view); };
exports.traverseView = function (f, view) {
  var data = f(view);
  var subviews = view.getSubviews().map(bind(this, 'traverseView', f));
  return {
    uid: view.uid,
    data: data,
    subviews: subviews.length ? subviews : undefined
  };
};

exports.find = function (f) { return GC.app && exports.findView(f, GC.app.view); };
exports.findView = function (f, view) {
  if (f(view)) { return view; }
  var subviews = view.getSubviews();
  for (var i = 0, sub; sub = subviews[i]; ++i) {
    var res = exports.findView(f, sub);
    if (res) { return res; }
  }

  return false;
};

var _isHighlighting = false;
var _highlightViews = [];

var _renderHighlights = (function () {
  var prev = null;
  var highlight = 0;
  var fadeIn = true;
  var FADE_IN_TIME = 1000;
  return function (ctx) {
    var now = Date.now();
    var dt = 0;
    if (prev) {
      dt = now - prev;
    }

    prev = now;

    if (fadeIn) {
      highlight += dt;
      if (highlight >= FADE_IN_TIME) {
        fadeIn = false;
        highlight = FADE_IN_TIME;
      }
    } else {
      highlight -= dt;
      if (highlight < 0) {
        fadeIn = true;
        highlight = 0;
      }
    }

    var gray = Math.round(255 * highlight / FADE_IN_TIME);

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(' + gray + ',' + gray + ',' + gray + ',' + gray / 512 + ')';

    var outlinedParents = {};
    _highlightViews.forEach(function (highlight) {
      var view = highlight.view;
      var opts = highlight.opts;
      if (opts.outlineParents) {
        var superview = view.getSuperview();
        while (superview) {
          view = superview;
          superview = view.getSuperview();
          if (!(view.uid in outlinedParents)) {
            outlinedParents[view.uid] = true;
            var pos = view.getPosition();
            ctx.save();
            ctx.strokeStyle = 'rgba(' + gray + ',0,0,1)';
            ctx.translate(pos.x, pos.y);
            ctx.rotate(pos.r);
            ctx.strokeRect(-0.5, -0.5, pos.width + 1, pos.height + 1);
            ctx.restore();
          }
        }
      }
    });

    _highlightViews.forEach(function (highlight) {
      var view = highlight.view;
      var opts = highlight.opts;
      var pos = view.getPosition();
      ctx.save();
      ctx.fillStyle = 'rgba(' + gray + ',' + gray + ',' + gray + ',' + gray / 512 + ')';
      ctx.strokeStyle = 'rgba(' + gray + ',0,0,1)';
      ctx.translate(pos.x, pos.y);
      ctx.rotate(pos.r);
      ctx.fillRect(0, 0, pos.width, pos.height);
      ctx.strokeRect(-0.5, -0.5, pos.width + 1, pos.height + 1);
      ctx.restore();
    });

    ctx.restore();
  };
})();

exports.unhighlightViews = function () {
  _highlightViews = [];
  disableHighlighting();
};

function getHighlightIndex(view) {
  var n = _highlightViews.length;
  for (var i = 0; i < n; ++i) {
    if (_highlightViews[i].view === view) {
      return i;
    }
  }

  return -1;
}

function enableHighlighting() {
  if (!_isHighlighting) {
    _isHighlighting = true;
    GC.app.engine.on('Render', _renderHighlights);
  }
}

function disableHighlighting() {
  _isHighlighting = false;
  GC.app.engine.removeListener('Render', _renderHighlights);
}

exports.highlightView = function (view, opts) {
  if (getHighlightIndex(view) === -1) {
    _highlightViews.push({view: view, opts: opts || {}});
    enableHighlighting();
  }
};

exports.unhighlightView = function (view) {
  var i = getHighlightIndex(view);
  if (i !== -1) {
    _highlightViews.splice(i, 1);
  }

  if (!_highlightViews.length) {
    disableHighlighting();
  }
};

exports.getViewById =
exports.getViewByID = function (uid) { return exports.find(function (view) { return view.uid == uid; }); };

exports.getImages = function (view) {
  import ui.ImageView;
  import ui.ImageScaleView;

  var hash = {};
  exports.traverseView(function (view) {
    if (view instanceof ui.ImageView || view instanceof ui.ImageScaleView) {
      var img = view.getImage();
      if (img) {
        var url = img.getOriginalURL();
        hash[url] = true;
      }
    }

  }, view || GC.app);

  var images = Object.keys(hash);
  images.sort();
  return images;
};

exports.pack = function () { return GC.app && exports.packView(GC.app.view); };
exports.packView = function (view) {
  import ui.ImageView;
  import ui.ImageScaleView;
  import ui.TextView;

  return exports.traverseView(function (view) {
    var imageData;
    var sourceSlices;
    var destSlices;
    if (view instanceof ui.ImageView || view instanceof ui.ImageScaleView) {
      var img = view.getImage();
      if (img) {
        imageData = img.getOriginalURL() || img.getMap();
      }

      if (view.getScaleMethod) {
        var scaleMethod = view.getScaleMethod();
        if (/slice$/.test(scaleMethod)) {
          sourceSlices = view._opts.sourceSlices;
          destSlices = view._opts.destSlices;
        }
      }
    }

    var text;
    if (view instanceof ui.TextView) {
      text = view.getText();
    }

    var s = view.style;
    return {
      x: s.x ? s.x : undefined,
      y: s.y ? s.y : undefined,
      width: s.width,
      height: s.height,
      scale: s.scale != 1 ? s.scale : undefined,
      sourceSlices: sourceSlices,
      destSlices: destSlices,
      scaleMethod: scaleMethod,
      image: imageData,
      text: text,
      visible: s.visible == false ? false : undefined,
      opacity: s.opacity != 1 ? s.opacity : undefined,
      tag: view.getTag()
    };
  }, view);
};

exports.unpack = function (data) {
  import ui.View;
  import ui.ImageView;
  import ui.resource.Image;
  import ui.TextView;
  import ui.ScrollView;

  function buildView (superview, data) {
    var view;

    var opts = data.data;
    opts.x = opts.x || 0;
    opts.y = opts.y || 0;
    opts.visible = 'visible' in opts ? opts.visible : true;
    opts.opacity = 'opacity' in opts ? opts.opacity : 1;
    opts.scale = opts.scale || 1;
    if (opts.image) {
      var img = opts.image;
      view = new ui.ImageView({
        x: opts.x,
        y: opts.y,
        width: opts.width,
        height: opts.height,
        scale: opts.scale,
        clip: opts.clip,

        scaleMethod: opts.scaleMethod,
        slices: opts.slices,

        superview: superview,
        image: typeof img == 'string' ? img : new ui.resource.Image({
          url: img.url,
          sourceX: img.x,
          sourceY: img.y,
          sourceW: img.width,
          sourceH: img.height,
          marginTop: img.marginTop,
          marginRight: img.marginRight,
          marginBottom: img.marginBottom,
          marginLeft: img.marginLeft
        }),
        visible: opts.visible,
        opacity: opts.opacity,
        tag: opts.tag
      });
    } else {
      view = new (opts.text ? ui.TextView : (opts.clip ? ui.ScrollView : ui.View))({
        x: opts.x,
        y: opts.y,
        clip: opts.clip,
        width: opts.width,
        height: opts.height,
        text: opts.text,
        superview: superview,
        scale: opts.scale,
        visible: opts.visible,
        opacity: opts.opacity,
        tag: opts.tag
      });
    }

    view.uid = data.uid;

    if (data.subviews) {
      for (var i = 0, sub; sub = data.subviews[i]; ++i) {
        buildView(view, sub);
      }
    }
  }

  GC.app.view.updateOpts(data.data);
  for (var i = 0, sub; sub = data.subviews[i]; ++i) {
    buildView(GC.app.view, sub);
  }
};

exports.eachView = function (list, f) {
  for (var i = 0, n = list.length; i < n; ++i) {
    var view = exports.getViewByID(list[i]);
    if (view) {
      f(view, list[i]);
    } else {
      logger.warn('view', list[i], 'not found');
    }
  }
};

exports.hideViews = function (/* id1, id2, id3, ... */) {
  exports.eachView(arguments, function (view) { view.style.visible = false; });
};

exports.showViews = function (/* id1, id2, id3, ... */) {
  exports.eachView(arguments, function (view) { view.style.visible = true; });
};

exports.hideAllViews = function () {
  exports.traverse(function (view) { view.style.visible = false; });
};

exports.showAllViews = function () {
  exports.traverse(function (view) { view.style.visible = true; });
};

exports.hideViewRange = function (a, b) {
  var range = [];
  for (var i = a; i < b; ++i) {
    range.push(i);
  }

  exports.hideViews.apply(this, range);
};

exports.showViewRange = function (a, b) {
  var range = [];
  for (var i = a; i < b; ++i) {
    range.push(i);
  }

  exports.showViews.apply(this, range);
};
