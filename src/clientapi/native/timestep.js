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

import device;

var hasNativeViews = GLOBAL.NATIVE && NATIVE.timestep && NATIVE.timestep.View;

var VIEW_TYPES = {
	DEFAULT: 0,
	IMAGE_VIEW: 1
};

function installNativeView() {
	// extend the timestep View class
	import .timestep.NativeView;
	timestep.NativeView.install();

	import ui.View as View;
	View.setDefaultViewBacking(NATIVE.timestep.View);

	// extend the timestep ViewBacking class
	import .timestep.NativeViewBacking;
	timestep.NativeViewBacking.install();

	import .timestep.NativeImageView;
	timestep.NativeImageView.install();

	var animate = device.importUI('animate');
	animate.setViewAnimator(NATIVE.timestep.Animator);
	merge(NATIVE.timestep.Animator.prototype, {
		subscribe: function () {},
		pause: function () {},
		resume: function () {},
		__finish: function () {},
		_isRunning: function () {}
	});
	
	// add some properties to View and ImageView to defer to native rendering
	import ui.View as View;
	View.prototype.__type = VIEW_TYPES.DEFAULT;

	import ui.ImageView as ImageView;
	ImageView.prototype.__type = VIEW_TYPES.IMAGE_VIEW;
	ImageView.prototype.render.HAS_NATIVE_IMPL = true;

	logger.log("USING NATIVE VIEWS");
}

logger.log(typeof GLOBAL.CONFIG, GLOBAL.CONFIG && CONFIG.disableNativeViews);

if (GLOBAL.CONFIG && CONFIG.disableNativeViews || !hasNativeViews) {
	logger.log("USING JS VIEWS");
	exports.install = function () {};
} else {
	exports.install = installNativeView;
}
