/**
 * Shallow clone
 */
var shallowClone = function (dest, src) {
  // Clear destination
  Object.keys(dest).forEach(function(key) {
    dest[key] = undefined;
  });

  // Copy source into destination
  Object.keys(src).forEach(function(key) {
    dest[key] = src[key];
  });
};

var rArrayIndex = /^\s*\-?\d+\s*$/;
var rArrayFilterItem = /(\w+)\s*=\s*(\w+)|has\((.*?)\)/;
var rStrip = /^\s+|\s+$/;
var rKeyParser = /^\s*(.*?)(\[\s*(.*?)\s*\])?\s*$/;

function quote(str) { return JSON.stringify(str); }
function quoteIfString(str) { return isNaN(str) ? quote(str) : str; }

/**
 * Sets the value at an array index
 */
var setElement = function (index, value) {
  // handle negative and last index
  if (index < 0) {
    index = this.length + index;
  } else if (index === 'last') {
    index = this.length;
  }

  // if index is beyond array contents, push the value on the end
  if (index >= this.length) {
    this[index] = value;
    return;
  }

  // Set value for element in array. Objects are cloned, arrays are spliced.
  // Undefined removes an element and reindexes.
  var valueType = typeof value;
  var existing = this[index];
  if (valueType == 'undefined') {
    // remove the element at the index
    this.splice(index, 1);
    return;
  } else if (Array.isArray(value)) {
    if (Array.isArray(existing)) {
      // Replace values in existing array with values in other array
      existing.splice.apply(existing, [0, existing.length].concat(value));
      return;
    }
  } else if (valueType == 'object' && typeof existing == 'object') {
    shallowClone(existing, value);
    return;
  }

  this[index] = value;
};

var setValueForKey = function (obj, key, value) {
  if (typeof key == 'number') {
    setElement.call(obj, key, value);
  } else {
    // not an array
    if (typeof value === 'undefined') {
      // Remove key from object
      obj[key] = void 0;
    } else {
      // Set value on object
      obj[key] = value;
    }
  }
};

/**
 * Parses a string key of the form "foo.bar[a=1, b=2].baz[alpha = beta].delta"
 */
function parseKey(key) {
  var pieces = [];
  key.split('.').forEach(function (piece) {

    var match = piece.match(rKeyParser);
    if (match && match[1]) {
      pieces.push(match[1]);
    }

    if (match && match[2]) {
      var index = match[3];
      // if just a number, probably an array index
      if (rArrayIndex.test(index)) {
        pieces.push(parseInt(index));
      } else {
        // generate function to check for matching item
        pieces.push(new Function('var item = arguments[0]; return ' + piece
          .split(',')
          .map(function (piece) {
            var match = piece.match(rArrayFilterItem);
            if (!match) {
              return 'true';
            } else if (match[3]) {
              // support 'has(x)'
              return quote(match[3]) + ' in item';
            } else {
              // compare field against requested value
              return 'item[' + quote(match[1]) + ']==' + quoteIfString(match[2]);
            }
          })
          .join('&&')));
      }
    }
  });

  return pieces;
}

/**
 * Retrieve a value from an object. Supports keys of the format 'foo.bar.baz[5]'
 */
exports.getVal = function (obj, key) {
  if (!obj) { return; }

  var pieces = parseKey(key);
  var index = 0;
  var n = pieces.length;
  while (obj && index < n) {
    var piece = pieces[index++];
    if (typeof piece == 'function' && Array.isArray(obj)) {
      obj = obj.filter(piece)[0];
    } else if (piece == 'last') {
      obj = obj[obj.length - 1];
    } else {

      // support negative indexes
      if (typeof piece === 'number' && piece < 0) {
        piece = obj.length + piece;
      }

      obj = obj[piece];
    }
  }

  return obj;
};

/**
 * Set value in an object. Supports keys of the format 'foo.bar.baz[5]'
 */
exports.setVal = function (obj, key, value) {
  _setVal(parseKey(key), value, 0, obj);
  return obj;
};

function _setVal(pieces, value, index, obj) {
  // iterate until one before the end (the last piece is the final key to set)
  var max = pieces.length - 1;
  while (index < max) {
    var piece = pieces[index++];
    if (typeof piece == 'function') {
      // filter an array based on a filter function, all matching array items
      // should be set to the proper value recursively
      return obj
        .filter(piece)
        .forEach(bind(this, _setVal, pieces, value, index));
    }

    // if the next value is not defined or of the wrong type, set it to an
    // empty object or array
    var nextType = typeof pieces[0]; // TODO
    if (nextType == 'number' || nextType == 'function') {
      if (!Array.isArray(obj[piece])) {
        obj[piece] = [];
      }
    } else {
      if (typeof obj[piece] != 'object' || !obj[piece]) {
        obj[piece] = {};
      }
    }

    obj = obj[piece];
  }

  if (typeof pieces[max] == 'function') {
    // if the last part of the path is a filter, we need to conditionally set
    // the elements in the array
    var filter = pieces[max];
    var i = obj.length;
    while (i) {
      // iterate backward in case we're deleting elements
      if (filter(obj[--i])) {
        setValueForKey(obj, i, value);
      }
    }
  } else {
    setValueForKey(obj, pieces[max], value);
  }
}
