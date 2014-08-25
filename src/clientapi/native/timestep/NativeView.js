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

// monkey patch the View prototype (object composition)

from ui.filter import Filter;

exports.install = function () {
	import ui.View as View;

	var proto = View.prototype;

	proto.setFilter = function (filter) {
		this.removeFilter();
		this._filter = filter;
		filter.setView(this);
		filter.update();
	};

	proto.removeFilter = function () {
		if (this._filter) {
			this._filter.removeView(this);
			this._filter = null;
			this.__view.filterType = 0;
			this.__view.filterColor = 'rgba(0,0,0,0)';
		}
	};
};
