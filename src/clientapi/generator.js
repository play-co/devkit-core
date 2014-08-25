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

var creatures = ["urchin", "cucumber", "dolphin", "shark", "whale", "otter", "starfish", "coral",
	"eel", "goldfish", "manatee", "salmon", "trout", "bass", "halibut", "clam", "oyster", "shrimp",
	"tuna", "plankton", "seaweed", "algae", "ocotopus", "squid", "mantaray", "stingray", "walrus"];

var adjectives = ["fuming", "melancholy", "scheming", "hyper", "happy", "sad", "confused", "wired",
	"engergized", "smug", "cool", "sleepy", "party", "sick", "down-to-earth", "droopy-eyed",
	"dopey", "mopey", "desperate", "envious", "somber", "panicked", "alarmed", "impatient", "tense",
	"jealous", "irate", "jealous", "warped", "zealous", "livid", 'undersized', 'prismatic',
	'uppity', 'polygot', 'renascent', 'nonliving', 'contrapuntal', 'demonstrable', 'sanguine',
	'raspiest', 'cracklier', 'presumptive', 'standoffish', 'wartier', 'nethermost', 'upstream',
	'placating', 'localized', 'specked', 'aluminum', 'singled', 'ingested', 'ostensible',
	'seventeen', 'bonded', 'quantitative', 'lettered', 'pickled', 'stolid', 'dignifying', 'marred'];

var colors = ["red", "green", "orange", "blue", "rainbow", "yellow", "white", "zebra", "chartreuse",
	"magenta", "turqouise", "cyan", "steel", "forest"];

var nouns = ['option', 'numeracy', 'freeloading', 'minivan', 'wastepaper', 'junketeer',
	'harmlessness', 'actuator', 'carnelian', 'perfectionism', 'sleepwalker', 'brewer', 'cadmium',
	'reformist', 'condemner', 'metalworking', 'growler', 'honorer', 'campanologist', 'overcoat',
	'knob', 'abrasive', 'pebbling', 'perennial', 'logger', 'landslide', 'housework', 'nightfall',
	'tricycle', 'tameness'];

function merge () {
	return Array.prototype.concat.apply(arguments[0],
		Array.prototype.slice.call(arguments, 1));
}

exports.pick = function () {
	var list = merge.apply(this, arguments);
	return list[Math.random() * list.length | 0];
}

exports.gameName = function () {
	return exports.pick(adjectives) + ' ' + exports.pick(nouns);
}

exports.username = function () {
	return exports.pick(adjectives) + ' ' + exports.pick(creatures);
}

exports.name = function () {
	return exports.pick(nouns, creatures);
}

exports.tautogram = function () {
	while (true) {
		var name = exports.name();
		var letter = name.charAt(0);
		var a = merge(adjectives, colors).filter(function (a) { return a.charAt(0) == letter; });
		if (a.length) {
			return exports.pick(a) + ' ' + name;
		}
	}
}
