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

	var _isInstalled = false;

	exports.install = function (conn) {
		if (_isInstalled) { return; }
		_isInstalled = true;

		conn.onError = function (err) {
			logger.log('log protocol error:', err);
		}
		
		conn.onConnect(function () {
			conn.sendEvent("HANDSHAKE", {
				"type": jsio.__env.name,
				"appID": CONFIG.appID,
				"version": CONFIG.version,
				"title": CONFIG.title,
				"shortName": CONFIG.shortName,
				"userAgent": navigator.userAgent,
				"device": GLOBAL.NATIVE ? NATIVE.device : null
			});

			logger.log('DEBUGGING CONNECTION MADE');
		});

		conn.onDisconnect(function () {
			logger.log('DEBUGGING CONNECTION LOST');
		});

		conn.onRequest.subscribe('EVAL', this, function (req) {
			try {
				var value;
				if (GLOBAL.NATIVE && NATIVE.eval) {
					value = NATIVE.eval(req.args, "[console]");
				} else {
					value = window.eval(req.args, "[console]");
				}

				req.respond(stringify(value));
			} catch (e) {
				req.error(e.name + ": " + e.message);
			}
		});
	}
}
