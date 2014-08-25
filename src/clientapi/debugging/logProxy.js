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
	function stringify(value) {
		if (value === null) {
			return 'null';
		} else if (typeof value == 'object') {
			if (isArray(value)) {
				value = value.slice(0);
				for (var i = 0, n = value.length; i < n; ++i) {
					value[i] = stringify(value[i]);
				}
				return '[' + value.join(', ') + ']';
			} else if (value.__class__) {
				return '[object ' + value.__class__ + ']';
			} else {
				return Object.prototype.toString.call(value);
			}
		} else {
			return String(value);
		}
	}

	var _logBuffer = [];
	var _isInstalled = false;
	var _isEnabled = true;

	// insert a hook into the js.io logging system so that calls to logger get routed over the network
	exports.install = function (conn) {
		if (_isInstalled) { return; }
		_isInstalled = true;

		import base;

		var oldLog = base.log;

		// don't buffer logs if we haven't connected within 10 seconds
		var timeout = setTimeout(function () { _isEnabled = false; }, 10000);
		conn.onConnect(function () {
			clearTimeout(timeout);
			exports.flushBuffer();
		});

		var isLocked = false;
		base.log = function () {
			if (_isEnabled && !isLocked) {
				isLocked = true; // prevent recursive loops if sendEvent decides to log stuff

				// convert arguments to strings
				var n = arguments.length;
				var args = new Array(n);
				for (var i = 0; i < n; ++i) {
					args[i] = stringify(arguments[i]);
				}

				// buffer log lines
				if (!conn || !conn.isConnected()) {
					_logBuffer.push(args);
				} else {
					// flush logs
					if (_logBuffer[0]) {
						for (var i = 0, log; log = _logBuffer[i]; ++i) {
							conn.sendEvent('LOG', log);
						}
						_logBuffer = [];
					}

					// send log
					conn.sendEvent('LOG', args);
				}

				isLocked = false;
			}

			return oldLog.apply(this, arguments);
		};
	}

	exports.flushBuffer = function () {
		// we timed out, so bail
		if (!_logBuffer) { return conn.close(); }

		// if we buffered log messages, send them
		var n = _logBuffer.length;
		for (var i = 0; i < n; ++i) {
			conn.sendEvent('LOG', _logBuffer[i]);
		}

		_logBuffer = [];
	}
}
