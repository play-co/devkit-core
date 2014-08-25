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

// ensure that the ViewBacking update and copy methods
// are present on the native View prototype
exports.install = function () {
	import device;
	import ui.backend.BaseBacking as BaseBacking;

	var ViewBacking = device.importUI('ViewBacking');

	var proto = NATIVE.timestep.View.prototype;

	if (proto) {

		var srcProto = ViewBacking.prototype;

		proto.__proto__ = BaseBacking.prototype;

		// legacy
		proto.__firstRender = true;

		if (!proto.copy) {
			proto.copy = srcProto.copy;
		}

		if (!proto.localizePoint && proto.localizePt) {
			proto.localizePoint = proto.localizePt;
		}
	}
};
