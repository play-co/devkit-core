/** @license
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

// Import this before importing GC
// _api.client.init sets up the GC object for the client apis

import lib.PubSub;
import lib.Callback;
import std.uri as URI;
import ui.Engine;
import ui.View;
import ui.StackView;

import device;
var FontRenderer = device.get('FontRenderer');

if (device.simulatingMobileNative) {
	jsio('import .debugging.nativeShim');
}

if (!GLOBAL.CONFIG) { GLOBAL.CONFIG = {}; }
if (!GLOBAL.DEBUG) { GLOBAL.DEBUG = false; }

exports = Class(lib.PubSub, function () {

	var ua = navigator.userAgent;
	this.isNative = /TeaLeaf/.test(ua);
	if (this.isNative) {
		this.isIOS = /iPhone OS/.test(ua);
		this.isAndroid = /Android/.test(ua);
	} else if (/(iPod|iPhone|iPad)/i.test(ua)) {
		this.isMobileBrowser = true;
		this.isIOS = true;
		this.isUIWebView = !/Safari/.test(ua);
	} else if (/Android/.test(ua)) {
		this.isMobileBrowser = true;
		this.isAndroid = true;
	} else {
		this.isDesktop = true;
		this.isFacebook = GLOBAL.CONFIG.isFacebookApp;
	}

	this.isKik = /Kik\/\d/.test(ua);

	this.init = function (opts) {
		window.addEventListener('pageshow', bind(this, '_onShow'), false);
		window.addEventListener('pagehide', bind(this, '_onHide'), false);

		if (this.isKik && GLOBAL.cards && cards.browser) {
			cards.browser.on('foreground', bind(this, '_onShow'));
			cards.browser.on('background', bind(this, '_onHide'));
		}

		this.isOnline = navigator.onLine;

		window.addEventListener('online', bind(this, function () {
			if (!this.isOnline) {
				this.isOnline = true;
				this.publish('OnlineStateChanged', true);
			}
		}), false);

		window.addEventListener('offline', bind(this, function () {
			if (this.isOnline) {
				this.isOnline = false;
				this.publish('OnlineStateChanged', false);
			}
		}), false);

		// var uri = new URI(window.location);
		// var campaign = uri.query('campaign') || "NO CAMPAIGN";
		//
		// XXX: The following lines cause a DOMException in some browsers
		// because we're using a <base> tag, which doesn't resolve the URL relative correctly.
		//get rid of it in case the game uses something
		// if (window.history && window.history.replaceState) {
		// 	history.replaceState(null, null, uri.toString().replace("?campaign=" + campaign, ""));
		// }
		//
		// if (!localStorage.getItem("campaignID")) {
		// 	localStorage.setItem("campaignID", campaign)
		// }

		if (this.env == 'browser') { setTimeout(bind(this, '_onShow'), 0); }

		if (CONFIG.version) {
			logger.log('Version', CONFIG.version);
		}

	}

	GLOBAL.GC = new this.constructor();

	import .PluginManager;
	this.plugins = new PluginManager();

	GC.Application = ui.StackView;

	// this.track({
	// 	name: "campaignID",
	// 	category: "campaign",
	// 	subcategory: "id",
	// 	data: campaign
	// });

	import .UI;
	GC.ui = new UI();

	// import .OverlayAPI;
	// GC.overlay = new OverlayAPI(this.env);

	var map;
	try {
		if (GLOBAL.CACHE) {
			map = JSON.parse(GLOBAL.CACHE['spritesheets/map.json']);
		}
	} catch (e) {
		logger.warn("spritesheet map failed to parse", e);
	}

	import ui.resource.loader;
	GC.resources = ui.resource.loader;
	GC.resources.setMap(map);

	import AudioManager;

	this._onHide = function () {
		// signal to the app that the window is going away
		this.app && this.app.onPause && this.app.onPause();

		this.publish('Hide');
		this.publish('AfterHide');

		if (this.tracker) {
			this.tracker.endSession();
		}
	};

	this._onShow = function () {
		this.app && this.app.onResume && this.app.onResume();

		this.publish('Show');
		this.publish('AfterShow');
	}

	this.buildApp = function (entry) {
		jsio("import src.Application as Application");

		Application.prototype.__root = true;
		this.app = new Application();
		this.buildEngine(merge({view: this.app}, this.app._settings));

		this.emit('app', this.app);
	}

	this.buildEngine = function (opts) {
		if (!opts) { opts = {}; }
		if (!opts.entry) { opts.entry = 'launchUI'; }

		var view = opts.view;
		if (!view) {
			throw "a timestep.Engine must be created with a root view";
		}

		if (!(view instanceof ui.View)) {
			throw "src/Application.js must export a Class that inherits from ui.View";
		}

		view.subscribe('onLoadError', this, '_onAppLoadError');

		var launch;
		if (typeof view[opts.entry] == 'function') {
			launch = bind(view, opts.entry);
		}

		view.view = view; // legacy, deprecated
		view.engine = new ui.Engine(opts);
		view.engine.show();
		view.engine.startLoop();

		// expose global mute
		view.muteAll = AudioManager.muteAll;

		view.initUI && view.initUI();

		FontRenderer.init();

		var settings = view._settings || {};
		var preload = settings.preload;
		var autoHide = CONFIG.splash && (CONFIG.splash.autoHide !== false);
		if (preload && preload.length) {
			var cb = new lib.Callback();
			for (var i = 0, group; group = preload[i]; ++i) {
				GC.resources.preload(group, cb.chain());
			}

			// note that hidePreloader takes a null cb argument to avoid
			// forwarding the preloader result as the callback
			if (autoHide) { cb.run(GC, 'hidePreloader', null); }
			if (launch) { cb.run(launch); }
		} else {
			if (autoHide) { GC.hidePreloader(); }
			launch && launch();
		}
	};

	this._onAppLoadError = function (error) {
		logger.error('encountered error when creating src Application: ', JSON.stringify(error));
		var splash = CONFIG.splash;
		if (splash && splash.onAppLoadError) {
			splash.onAppLoadError(error);
		}
	};

	this.hideSplash =
	this.hidePreloader = function (cb) {
		var splash = CONFIG.splash;
		if (splash && splash.hide && !splash.hidden) {
			splash.hide(cb);
			splash.hidden = true;
		} else {
			cb && cb();
		}
	};
});
