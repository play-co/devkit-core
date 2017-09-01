let exports = {};

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
import {
  logger,
  bind,
  NATIVE
} from 'jsio_base';

import engineInstance from 'ui/engineInstance';

exports = class {
  constructor (env) {
    logger.log('env', env);
    switch (env) {
      case 'browser':
        this.delegate = new BrowserDelegate(this);
        break;
      case 'ios':
      case 'android':
        logger.log('adding an overlay for android or iphone');
        this.delegate = new IOSDelegate(this);
        break;
    }
  }
  setController (controller) {
    if (this.controller) {
      this.controller.onBeforeClose();
    }
    this.controller = controller;
  }
  send (data) {
    this.delegate.send(data);
  }
  show () {
    logger.log('showing overlay');

    if (this.controller.pauseTimestep()) {
      engineInstance.get().pause();
    }

    this.controller.onShow();
    this.delegate.show();
  }
  hide () {
    logger.log('hiding overlay');

    if (this.controller.pauseTimestep()) {
      engineInstance.get().resume();
    }

    this.controller.onHide();
    this.delegate.hide();
  }
  pushMenu (name) {
    this.delegate.send({
      type: 'ui',
      target: name,
      method: 'push'
    });
  }
  popMenu () {
    this.delegate.send({
      type: 'ui',
      method: 'pop'
    });
  }
  popToMenu (name) {
    this.delegate.send({
      type: 'ui',
      target: name,
      method: 'pop'
    });
  }
  showDialog (name) {
    this.delegate.send({
      type: 'ui',
      target: name,
      method: 'show'
    });
  }
  hideDialog (name) {
    this.delegate.send({
      type: 'ui',
      target: name,
      method: 'hide'
    });
  }
  load (name, opts) {
    if (!/^[a-zA-Z0-9]+$/.test(name)) {
      logger.error(
        'Invalid name for overlay! (only letters and numbers please)');
      return;
    }

    // var ctor = jsio('import overlay.' + name);
    // this.setController(new ctor(opts));
    // this.delegate.load(name);
    // return this.controller;
    throw new Error('TODO: Where is this supposed to import from?');
  }
};
var OverlayAPI = exports;

exports.prototype.BaseOverlay = class {
  pauseTimestep () {
    return true;
  }
  onEvent () {}
  onShow () {}
  onHide () {}
  onBeforeClose () {}
};

import browser from 'util/browser';
let $ = browser.$;
import device from 'device';

import doc from './doc';
import uri from 'std/uri';

class BrowserDelegate {
  constructor (api) {
    this._api = api;
    this._removeListener = $.onEvent(window, 'message', this, '_onMessage');
  }
  destroy () {
    if (this._removeListener) {
      this._removeListener();
      this._removeListener = null;
    }
  }
  load (name) {
    if (!this._el) {
      this._el = $({
        src: 'javascript:var d=document;d.open();d.close()',
        tag: 'iframe',
        parent: doc.getElement(),
        style: {
          border: 0,
          width: '100%',
          minHeight: '100%',
          height: '100%',
          position: 'absolute',
          top: '0px',
          left: '0px'
        },
        attrs: {
          border: 'no',
          allowTransparency: 'yes'
        }
      });

      $.hide(this._el);
    }

    var src = new uri('overlay/' + name + '.html');
    if (device.simulating) {
      src.addHash({ simulate: encodeURIComponent(device.simulating) });
    }

    if (device.isMobileBrowser) {
      src.addHash({ mobileBrowser: 1 });
      var removeListener = $.onEvent(this._el, 'load', function (evt) {
        removeListener();
        device.hideAddressBar(false);
        setTimeout(bind(device, 'hideAddressBar', false), 0);
      });
    }

    this._el.src = src;
  }
  _onMessage (e) {
    var data = e.data;
    if (data.substring(0, 8) == 'OVERLAY:') {
      try {
        var evt = JSON.parse(e.data.substring(8));
      } catch (e) {}

      if (evt) {
        this._api.controller.onEvent(evt);
      }
    }
  }
  send (data) {
    var win = this._el.contentWindow;
    win.postMessage('OVERLAY:' + JSON.stringify(data), '*');
  }
  show () {
    this.send({ type: 'show' });
    $.show(this._el);
    device.hideAddressBar();
  }
  hide (data) {
    this.send({ type: 'hide' });
    $.hide(this._el);
    device.hideAddressBar();
  }
}

class IOSDelegate {
  constructor (api) {
    this._api = api;
  }
  load (name) {
    logger.log('loading', name);
    NATIVE.overlay.load('/overlay/' + name + '.html?' + +new Date());
    if (!this._subscribed) {
      logger.log('subscribing to ', NATIVE.overlay.delegate);
      NATIVE.overlay.delegate.subscribe('message', this, '_onMessage');
      this._subscribed = true;
    }
  }
  _onMessage (data) {
    logger.log('got a message', data);
    this._api.controller.onEvent(data);
  }
  show () {
    NATIVE.overlay.show();
  }
  hide () {
    NATIVE.overlay.hide();
  }
  send (data) {
    logger.log('doing native.overlay.send');
    NATIVE.overlay.send(JSON.stringify(data));
  }
}

export default exports;
