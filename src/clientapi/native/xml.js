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

var getAttribute = function (name) {
	return this.xml['@'+name].toXMLString();
}

var getElementsByTagName = function (tag) {
	var ret = [];
	var elements = this.xml[tag];
	for (var i = 0; i < elements.length(); i++) {
		ret.push({
			xml: elements[i],
			getAttribute: getAttribute,
			getElementsByTagName: getElementsByTagName,
			textContent:elements[i].text()
		});
	};
	return ret;
};

exports = {
	parseString: function (data) {
		data = data.replace(/^<\?xml\s+version\s*=\s*(["'])[^\1]+\1[^?]*\?>/, "")

		var xml = new XML(data);
		return {
			xml: xml,
			getAttribute: getAttribute,
			getElementsByTagName: getElementsByTagName
		};

	}
};



