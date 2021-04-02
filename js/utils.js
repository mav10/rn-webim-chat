"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebimSubscription = exports.processError = exports.parseNativeResponse = void 0;
function parseNativeResponse(response) {
    return response || null;
}
exports.parseNativeResponse = parseNativeResponse;
function processError(error) {
    return new Error(error.message);
}
exports.processError = processError;
var WebimSubscription = /** @class */ (function () {
    function WebimSubscription(remove) {
        this.remove = remove;
    }
    return WebimSubscription;
}());
exports.WebimSubscription = WebimSubscription;
//# sourceMappingURL=utils.js.map