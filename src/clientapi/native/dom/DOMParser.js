import .dom_parser;
exports.install = function() {
    if (!window.DOMParser) {
        window.DOMParser = dom_parser.DOMParser;
    }
};
