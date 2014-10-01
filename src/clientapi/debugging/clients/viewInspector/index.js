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

// this whole file should not get included in release
if (DEBUG) {
  import device;
  import math.geom.Point as Point;
  import ui.resource.Image as Image;
  import ui.ImageView as ImageView;

  import ...InputMoveListener;
  import .OverlayRenderer;

  // mapping for reading/writing style properties on a view
  // map: inspector id -> style property
  var _propMap = {
    relX: 'x',
    relY: 'y',
    relR: 'r',
    relWidthPercent: 'widthPercent',
    relHeightPercent: 'heightPercent',
    relWidth: 'width',
    relHeight: 'height',
    relScale: 'scale',
    opacity: 'opacity',
    zIndex: 'zIndex',
    visible: 'visible',
    anchorX: 'anchorX',
    anchorY: 'anchorY',
    offsetX: 'offsetX',
    offsetY: 'offsetY',
    clip: 'clip',
    layout: 'layout',
    inLayout: 'inLayout',
    top: 'top',
    left: 'left',
    bottom: 'bottom',
    right: 'right',
    flex: 'flex',
    direction: 'direction',
    justifyContent: 'justifyContent',
    order: 'order',

    layoutWidth: 'layoutWidth',
    layoutHeight: 'layoutHeight',
    centerX: 'centerX',
    centerY: 'centerY',
    minWidth: 'minWidth',
    minHeight: 'minHeight',
    maxWidth: 'maxWidth',
    maxHeight: 'maxHeight',
  };

  var ViewInspectorClient = Class(function () {
    this.init = function () {
      this._overlay = new OverlayRenderer();
      GC.on('app', bind(this, '_onApp'));
    };

    this.setConn = function (conn) {
      var client = conn.getClient('devkit.viewInspector');
      this._client = client;

      client.onEvent('BATCH', bind(this, function (evt) {
        debugger;
        // var i;
        // for (i in evt.args) {
        //  client.onEvent.publish(evt.args[i].name, evt.args[i].args);
        // }
      }));

      client.onEvent('SET_NAME', bind(this, function (evt) {
        GLOBAL._name = evt.args.name;
        logging.setPrefix(evt.args.name + ': ');
      }));

      function getParentUIDs(view) {
        var uids = view.getSuperviews().map(function (view) { return view.uid; });
        uids.push(view.uid);
        return uids;
      }

      var _input = null;
      client.onRequest('ADD_MOUSE_EVT', bind(this, function (req) {
        if (!_input) {
          _input = new InputMoveListener({requireShiftClick: true})
            .on('trace', function (evt) {
              client.sendEvent('INPUT_TRACE', {
                x: evt.x,
                y: evt.y,
                target: evt.target.uid,
                trace: evt.trace.map(function (item) {
                  return {
                    uid: item.view.uid,
                    tag: item.view.getTag(),
                    depth: item.depth
                  };
                })
              });
            })
            .on('move', function (evt) {
              client.sendEvent('INPUT_MOVE', {
                parents: getParentUIDs(evt.target)
              });
            })
            .on('select', function (evt) {
              client.sendEvent('INPUT_SELECT', {
                parents: getParentUIDs(evt.target)
              });
            });
        }

        _input.connect();
        req.respond();
      }));

      client.onRequest('REMOVE_MOUSE_EVT', bind(this, function (req) {
        if (_input) { _input.disconnect(); }
        req.respond();
      }));

      client.onEvent('SET_HIGHLIGHT', bind(this, function (req) {
        this._overlay.setHighlight(req.args.uid);
        //this._overlay.render();
      }));

      client.onEvent('SET_SELECTED', bind(this, function (req) {
        this._overlay.setSelected(req.args.uid);
        //this._overlay.render();
      }));

      function findBetterTag (view) {
        var parent = view.getSuperview();
        for (var key in parent) {
          if (parent[key] === view) {
            return key;
          }
        }

        return null;
      }

      client.onRequest('GET_ROOT_UID', bind(this, function (req) {
        req.respond({uid: GC.app.uid});
      }));

      client.onRequest('GET_VIEW', bind(this, function (req) {
        var view = _DEBUG.getViewByID(req.args.uid);
        if (!view) {
          req.error('no view with id' + req.args.uid, {VIEW_NOT_FOUND: true});
        } else {
          var sup = view.getSuperview();

          //create the optimal tag
          var tag = view.getTag && view.getTag() || view.toString();
          var betterTag = findBetterTag(view);
          if (betterTag) tag = betterTag + ":" + tag;

          req.respond({
            uid: view.uid,
            superviewID: sup && sup.uid,
            tag: tag,
            subviewIDs: view.getSubviews().map(function (view) { return view.uid; })
          });
        }
      }));

      client.onRequest('REPLACE_IMAGE', bind(this, function (req) {
        var args = req.args;
        var imgData = args.imgData;
        var uid = args.uid;

        var view = _DEBUG.getViewByID(uid);
        var newImg = new Image();

        newImg._srcImg.addEventListener("load", function () {
          var map = newImg._map;
          map.width = newImg._srcImg.width,
          map.height = newImg._srcImg.height,
          map.x = 0;
          map.y = 0;
          view.setImage(newImg);
          view.needsRepaint();
        }, false);

        newImg._srcImg.src = imgData;
      }));

      client.onRequest('GET_VIEW_PROPS', bind(this, function (req) {
        var args = req.args;
        var view = _DEBUG.getViewByID(args.uid);
        if (!view) {
          return req.error("VIEW_NOT_FOUND");
        }

        var s = view.style;
        var p = view.getPosition();
        var layout = view.__layout;
        var ret = {};
        for (var key in _propMap) {
          ret[key] = s[_propMap[key]];
        }

        merge(ret, {
          absX: p.x,
          absY: p.y,
          absR: p.r,
          absWidth: p.width,
          absHeight: p.height,
          absScale: p.scale,

          subviews: layout && (typeof layout.getSubviews == 'function') && layout.getSubviews().length,
          direction: layout && (typeof layout.getDirection == 'function') && layout.getDirection(),
          padding: s.padding && s.padding.toString()
        });

        for (var key in ret) {
          if (ret[key] == undefined) {
            ret[key] = '-';
          }
        }

        ret.isImageView = view instanceof ImageView;

        if (ret.isImageView) {
          ret.imagePath = view._opts.image || (view._img && view._img._map && view._img._map.url);
          if (ret.imagePath && ret.imagePath._map) {
            ret.imagePath = ret.imagePath._map.url;
          }
        }

        ret.uuid = args.uid;

        ret.description = (view.constructor.name || 'View') + ' ' + args.uid + '\n' + view.getTag();

        req.respond(ret);
      }));

      client.onRequest('SET_VIEW_PROP', bind(this, function (req) {
        var args = req.args;
        var view = _DEBUG.getViewByID(args.uid);
        if (!view) {
          return req.error("VIEW_NOT_FOUND");
        }

        var key = args.key;
        var value = args.value;
        if (key in _propMap) {
          view.style[_propMap[key]] = value;
        } else {
          switch (key) {
            case 'absX': break;
            case 'absY': view.style.y = value; break;
            case 'absWidth': view.style.width = value; break;
            case 'absHeight': view.style.height = value; break;
            case 'absScale': view.style.scale = value; break;
            case 'padding': view.style.padding = value; break;
          }
        }
      }));

      var _pollTimer = null;
      var _pollView = null;

      client.onEvent('POLL_VIEW_POSITION', bind(this, function (evt) {

        if (_pollTimer) {
          clearTimeout(_pollTimer);
        }

        function poll() {
          if (_pollView) {
            var eventData = _pollView.getPosition();
            eventData.uid = _pollView.uid;

            client.sendRequest('POLL_VIEW_POSITION', eventData, bind(this, function (err, res) {
              setTimeout(poll, 250);
            }));
          }
        }

        _pollView = _DEBUG.getViewByID(evt.args.uid);
        if (!_pollTimer && _pollView) {
          _pollTimer = setTimeout(poll, 500);
        }

      }));

      if (GC.app) {
        this._onApp(GC.app);
      }
    }

    this._onApp = function (app) {
      this._client.sendEvent('APP_READY', {uid: app.view.uid});
      app.engine.unsubscribe('Render', this);
      app.engine.subscribe('Render', this._overlay, 'render');

      app.engine.on('resume', bind(this._overlay, 'stopTick'));
      app.engine.on('pause', bind(this._overlay, 'startTick'));
    }
  });

  exports = new ViewInspectorClient();
}
