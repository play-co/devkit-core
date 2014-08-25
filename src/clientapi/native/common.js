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

exports.install = function (TeaLeaf, hostname) {
    logger.log('installing native support');

	import device;
	import lib.PubSub;
	import .Window;
	import .Document;
	import .localStorage;
	import .events;
	import .launchInfo;
	import .plugins;
	import .screen;
	import .Image;
	Image.install();
	import .XMLHttpRequest;
	XMLHttpRequest.install();
	import .Audio;
	Audio.install();

    import .dom.DOMParser;
    dom.DOMParser.install();


	import platforms.native.Canvas;

	if(NATIVE.device.native_info) {
		NATIVE.device.info = JSON.parse(NATIVE.device.native_info);
	}

	import .timestep;
	timestep.install();

	// publisher for the overlay UIWebView
	NATIVE.overlay.delegate = new lib.PubSub();
	CONFIG.splash = CONFIG.splash || {};
	var oldHide = CONFIG.splash.hide || function () {};
	CONFIG.splash.hide = function (cb) {
		if (NATIVE.doneLoading instanceof Function) {
			NATIVE.doneLoading();
		}

		if (oldHide instanceof Function) {
			oldHide();
		}

		cb && cb();
	};
}
