let exports = {};

import dom_parser from './dom_parser';
exports.install = function () {
  if (!window.DOMParser) {
    window.DOMParser = dom_parser.DOMParser;
  }
};

export default exports;
