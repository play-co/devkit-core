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
import device;

if (device.isIOS && GLOBAL.Proxy) {
	var _ls = {
		length: 0,
		getItem: NATIVE.localStorage.getItem,
		setItem:function (key, value) {logger.log('setting item', value, 'for key', key); NATIVE.localStorage.setItem(key, value.toString()); },
		removeItem: NATIVE.localStorage.removeItem,
		clear: NATIVE.localStorage.clear,
		key: NATIVE.localStorage.key
	};

	var localStorageHandler = {
		get: function (proxy, name) {
			return _ls[name] || NATIVE.localStorage.getItem(name); 
		},
		set: function (proxy, name, value) {
			if (NATIVE.localStorage.setItem(name, value.toString())) {
				_ls.length++;
			}
		}
	};

	if (typeof localStorage == 'undefined') {
		GLOBAL.localStorage = Proxy.create(localStorageHandler);
	}
} else {*/
	GLOBAL.localStorage = {
		setItem: function (key, value) { NATIVE.localStorage.setItem(key.toString(), value.toString()); },
		getItem: function (key) { return NATIVE.localStorage.getItem(key.toString() || null); },
		removeItem: function (key) { NATIVE.localStorage.removeItem(key.toString()); },
		clear: function () { NATIVE.localStorage.clear(); },
		key: function () { logger.log('ERROR: localStorage.key() unimplemented'); return null }
	};
//}
