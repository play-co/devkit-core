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

GLOBAL.console = logging.get('console');
window.self = window;

if (!window.DEV_MODE) { window.DEV_MODE = false; }

//install the device so that timestep knows where to get stuff

import device;
import platforms.native.initialize;

logger.log('getting initialize for native');
device.init();

import .common;
common.install();

startApp();

/**
 * Anonymous statistics, this information helps us improve the DevKit by
 * providing us information about which versions are out there.
 *
 * You can remove this or replace it with your own analytics if you like.
 */
function analytics () {
	var config = GLOBAL.CONFIG;
	var params = 'appID:' + escape(config.appID || '') + '&' +
			'bundleID:' + escape(config.bundleID || '') + '&' +
			'appleID:' + escape(config.appleID || '') + '&' +
			'version:' + escape(config.version || '') + '&' +
			'sdkVersion:' + escape(config.sdkVersion || '') + '&' +
			'isAndroid:' + (device.isAndroid ? 1 : 0) + '&' +
			'isIOS:' + (device.isIOS ? 1 : 0);

	var xhr = new XMLHttpRequest();
	xhr.open('GET', 'http://www.gameclosure.com/analytics?' + params, true);
	xhr.send();
}

function startApp (conn) {

	var type = "Client";
	//logging.setPrefix(type);

	// prefix filenames in the debugger
	jsio.__env.debugPath = function (path) { return '[' + type + ']:' + path; };

	logger.log('init debugging', jsio.__env.getCwd());

	import devkit;
	analytics();
	GC.buildApp('launchUI');

	if (conn) {
		conn.setApp(GC.app);
	}
}

