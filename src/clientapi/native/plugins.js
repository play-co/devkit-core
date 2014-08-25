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

import lib.Callback;
import lib.PubSub;

var pluginsPubSub = new lib.PubSub();

NATIVE.plugins.publish = bind(pluginsPubSub, 'publish');
NATIVE.plugins.subscribe = bind(pluginsPubSub, 'subscribe');
NATIVE.plugins.subscribeOnce = bind(pluginsPubSub, 'subscribeOnce');
NATIVE.plugins.unsubscribe = bind(pluginsPubSub, 'unsubscribe');

NATIVE.events.registerHandler('plugins', function (evt, id) {
	if (id) {
		var cb = _requestCbs[id];
		delete _requestCbs[id];
		cb && cb(evt.error, evt.response);
	} else {
		// TODO: probably this shouldn't be like this... maybe namespace by plugin name too, not just 'plugins'
		NATIVE.plugins.publish('Plugins', evt.data);
	}
});

NATIVE.events.registerHandler('pluginEvent', function (evt) {
	var plugin = GC.plugins.getPlugin(evt.pluginName);
	if (plugin) {
		plugin.publish(evt.eventName, evt.data);
	} else {
		logger.warn('plugin', evt.pluginName, 'not found');
	}
});

var _requestId = 0;
var _requestCbs = {};
NATIVE.plugins.sendRequest = function (pluginName, name, data, cb) {
	if (typeof data == 'function') {
		cb = data;
		data = null;
	}

	var id = ++_requestId;
	_requestCbs[id] = cb;

	var dataStr;
	if (data) {
		try {
			dataStr = JSON.stringify(data);
		} catch (e) {
			logger.error(e);
		}
	}

	NATIVE.plugins._sendRequest.call(this, pluginName, name, dataStr || '{}', id);
}
