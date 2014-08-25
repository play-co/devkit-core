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

var json_chars = {'[':']','{':'}','"':'"'};
var allowed_modes = ['stream', 'json', 'delimiter'];
exports.Reader = Class(function () {
    this.init = function (cb, rmode, delim) {
        this._buff = "";
        this._unclosed = [];
        this._checked = 0;
        this._name = null;
        this.setCb(cb);
        this.setMode(rmode || 'stream', delim);
    };

    this.setCb = function (func) {
        this._cb = func;
    };

    this.setMode = function (mode, delim) {
        if (allowed_modes.indexOf(mode) == -1) {
            throw new Error("illegal read mode:", mode);
        }
        this._mode = mode;
        this._delim = mode == 'delimiter' ? delim : null;
    };

    this.read = function (data) {
        this._buff += data;
        this._separate_events();
    };

    this._escaped = function (i) {
        if (i == 0 || this._buff.charAt(i - 1) != '\\') {
            return false;
        }
        return ! this._escaped(i - 1);
    };

    this._separate_events = function () {
        var frame;
        switch (this._mode) {
            case 'json':
                while (this._buff.length > this._checked) {
                    var last_unclosed = this._unclosed.length ?
                        this._unclosed[this._unclosed.length-1] : null;
                    var next_char = this._buff.charAt(this._checked);
                    if (this._unclosed.length > 0 && next_char == last_unclosed) {
                        if (! (next_char == '"' && this._escaped(this._checked)) ) {
                            this._unclosed.pop();
                        }
                    }
                    else if (next_char in json_chars && last_unclosed != '"') {
                        this._unclosed.push(json_chars[next_char]);
                    }
                    this._checked += 1;
                    if (this._buff && this._unclosed.length == 0) {
                        frame = JSON.parse(this._buff.slice(0, this._checked));
                        this._buff = this._buff.slice(this._checked);
                        this._checked = 0;
                        break;
                    }
                }
                break;
            case 'delimiter':
                var sep = this._buff.indexOf(this._delim);
                if (sep == -1) {
                    break;
                }
                frame = this._buff.slice(0, sep);
                this._buff = this._buff.slice(sep + this._delim.length);
                break;
            case 'stream':
            default:
                frame = this._buff.slice();
                this._buff = "";
                break;
        }
        if (frame) {
            this._cb(frame);
            this._separate_events();
        }
    };
});