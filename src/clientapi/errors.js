let exports = {};

import { GLOBAL } from 'jsio_base';

exports.createErrorClass = function (name, code) {
  return GLOBAL.eval('(function(){function ' + name + '(message,code){this.code=code||' + JSON.stringify(code) + ';this.message=message;' + (Error.captureStackTrace ? 'Error.captureStackTrace(this, ' + name + ')' : '') + '}' + name + '.prototype=Object.create(Error.prototype);' + name + '.prototype.constructor=' + name + ';' + 'return ' + name + '})')();
};

export default exports;
