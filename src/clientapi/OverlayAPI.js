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

var OverlayAPI = exports = Class(function () {
	this.init = function (env) {
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
	
	this.setController = function (controller) {
		if (this.controller) { this.controller.onBeforeClose(); }
		this.controller = controller;
	}
	
	this.send = function (data) {
		this.delegate.send(data);
	}
	
	this.show = function () {
		logger.log('showing overlay');

		if (this.controller.pauseTimestep()) {
			import ui.Engine;
			ui.Engine.get().pause();
		}

		this.controller.onShow();
		this.delegate.show();
	}

	this.hide = function () {
		logger.log('hiding overlay');

		if (this.controller.pauseTimestep()) {
			import ui.Engine;
			ui.Engine.get().resume();
		}
		
		this.controller.onHide();
		this.delegate.hide();
	}
	
	this.pushMenu = function (name) {
		this.delegate.send({type: 'ui', target: name, method: 'push'});
	}
	
	this.popMenu = function () {
		this.delegate.send({type: 'ui', method: 'pop'});
	}
	
	this.popToMenu = function (name) {
		this.delegate.send({type: 'ui', target: name, method: 'pop'});
	}

	this.showDialog = function (name) {
		this.delegate.send({type: 'ui', target: name, method: 'show'});
	}
	
	this.hideDialog = function (name) {
		this.delegate.send({type: 'ui', target: name, method: 'hide'});
	}
	
	this.load = function (name, opts) { 
		if (!/^[a-zA-Z0-9]+$/.test(name)) {
			logger.error('Invalid name for overlay! (only letters and numbers please)');
			return;
		}

		var ctor = jsio('import overlay.' + name);
		this.setController(new ctor(opts));
		this.delegate.load(name);
		return this.controller;
	}
});

exports.prototype.BaseOverlay = Class(function () {
	this.pauseTimestep = function () { return true; }
	
	this.onEvent = 
	this.onShow = 
	this.onHide = 
	this.onBeforeClose =
		function () {}
});

var BrowserDelegate = Class(function () {
	this.init = function (api) {
		from util.browser import $;
		import device;
		
		this._api = api;
		this._removeListener = $.onEvent(window, 'message', this, '_onMessage');
	}
	
	this.destroy = function () {
		if (this._removeListener) {
			this._removeListener();
			this._removeListener = null;
		}
	}
	
	this.load = function (name) {
		import .doc;
		import std.uri;
		
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
		
		var src = new std.uri('overlay/' + name + '.html');
		if (device.simulating) {
			src.addHash({simulate: encodeURIComponent(device.simulating)});
		}
		
		if (device.isMobileBrowser) {
			src.addHash({mobileBrowser: 1});
			var removeListener = $.onEvent(this._el, 'load', function (evt) {
				removeListener();
				device.hideAddressBar(false);
				setTimeout(bind(device, 'hideAddressBar', false), 0);
			});
		}
		
		this._el.src = src;
	}
	
	this._onMessage = function (e) {
		var data = e.data;
		if (data.substring(0, 8) == 'OVERLAY:') {
			try {
				var evt = JSON.parse(e.data.substring(8));
			} catch(e) {}
			
			if (evt) {
				this._api.controller.onEvent(evt);
			}
		}
	}
	
	this.send = function (data) {
		var win = this._el.contentWindow;
		win.postMessage('OVERLAY:' + JSON.stringify(data), '*');
	}
	
	this.show = function () {
		this.send({type: 'show'});
		$.show(this._el);
		device.hideAddressBar();
	}
	
	this.hide = function (data) {
		this.send({type: 'hide'});
		$.hide(this._el);
		device.hideAddressBar();
	}
});

var IOSDelegate = Class(function () {
	this.init = function (api) {
		this._api = api;
	}
	
	this.load = function (name) {
		logger.log('loading', name);
		NATIVE.overlay.load('/overlay/' + name + '.html?' + (+new Date()));
		if (!this._subscribed) {
			logger.log('subscribing to ', NATIVE.overlay.delegate);
			NATIVE.overlay.delegate.subscribe('message', this, '_onMessage');
			this._subscribed = true;
		}
	}
	
	this._onMessage = function (data) {
		logger.log('got a message', data);
		this._api.controller.onEvent(data);
	}
	
	this.show = function () {
		NATIVE.overlay.show();
	}
	
	this.hide = function () {
		NATIVE.overlay.hide();
	}
	
	this.send = function (data) {
		logger.log('doing native.overlay.send');
		NATIVE.overlay.send(JSON.stringify(data));
	}
});
