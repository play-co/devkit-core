'use strict';


const addClientPaths = (_path, _pathCache, clientPaths) => {
  for (var key in clientPaths) {
    if (key !== '*') {
      _pathCache[key] = clientPaths[key];
    } else {
      _path.push.apply(_path, clientPaths['*']);
    }
  }
};


module.exports = {
  addClientPaths: addClientPaths
};
