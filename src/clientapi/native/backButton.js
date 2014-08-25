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

import lib.PubSub;

NATIVE.backButton = new lib.PubSub();

/**
 * Register back button event. Calls NATIVE.onBackButton, and
 * sends game activity to the back unless NATIVE.onBackButton
 * returns true.
 */
NATIVE.events.registerHandler('backButton', function (evt) {
	if (NATIVE.onBackButton) {
		var result = NATIVE.onBackButton();
		
		logger.log('back button pushed');

		if ( result === false && typeof NATIVE.sendActivityToBack === 'function' ) {
			NATIVE.sendActivityToBack();
		}
	} else {
		NATIVE.backButton.emit('pressed');
	}
});
