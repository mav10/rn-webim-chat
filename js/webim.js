"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RNWebim = void 0;
var react_native_1 = require("react-native");
var types_1 = require("./types");
var utils_1 = require("./utils");
var WebimNative = react_native_1.NativeModules.RNWebim;
var emitter = new react_native_1.NativeEventEmitter(react_native_1.NativeModules.RNWebim);
var DEFAULT_MESSAGES_LIMIT = 100;
var RNWebim = /** @class */ (function () {
    function RNWebim() {
    }
    RNWebim.resumeSession = function (params) {
        return new Promise(function (resolve, reject) {
            WebimNative.resumeSession(params, function (error) { return reject(utils_1.processError(error)); }, function () { return resolve(); });
        });
    };
    RNWebim.destroySession = function (clearData) {
        if (clearData === void 0) { clearData = false; }
        return new Promise(function (resolve, reject) {
            WebimNative.destroySession(clearData, function (error) { return reject(utils_1.processError(error)); }, function () { return resolve(); });
        });
    };
    RNWebim.getLastMessages = function (limit) {
        if (limit === void 0) { limit = DEFAULT_MESSAGES_LIMIT; }
        return new Promise(function (resolve, reject) {
            WebimNative.getLastMessages(limit, function (error) { return reject(utils_1.processError(error)); }, function (messages) { return resolve(messages); });
        });
    };
    RNWebim.getNextMessages = function (limit) {
        if (limit === void 0) { limit = DEFAULT_MESSAGES_LIMIT; }
        return new Promise(function (resolve, reject) {
            WebimNative.getNextMessages(limit, function (error) { return reject(utils_1.processError(error)); }, function (messages) { return resolve(messages); });
        });
    };
    RNWebim.getAllMessages = function () {
        return new Promise(function (resolve, reject) {
            WebimNative.getAllMessages(function (error) { return reject(utils_1.processError(error)); }, function (messages) { return resolve(messages); });
        });
    };
    RNWebim.send = function (message) {
        return new Promise(function (resolve, reject) {
            return WebimNative.send(message, function (error) { return reject(utils_1.processError(error)); }, function (id) { return resolve(id); });
        });
    };
    RNWebim.rateOperator = function (rate) {
        return new Promise(function (resolve, reject) {
            WebimNative.rateOperator(rate, function (error) { return reject(utils_1.processError(error)); }, function () { return resolve(); });
        });
    };
    RNWebim.tryAttachFile = function () {
        var _this = this;
        return new Promise(function (resolve, reject) {
            WebimNative.tryAttachFile(function (error) { return reject(utils_1.processError(error)); }, function (file) { return __awaiter(_this, void 0, void 0, function () {
                var uri, name, mime, extension, e_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            uri = file.uri, name = file.name, mime = file.mime, extension = file.extension;
                            _a.label = 1;
                        case 1:
                            _a.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, RNWebim.sendFile(uri, name, mime, extension)];
                        case 2:
                            _a.sent();
                            resolve();
                            return [3 /*break*/, 4];
                        case 3:
                            e_1 = _a.sent();
                            reject(utils_1.processError(e_1));
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
        });
    };
    RNWebim.sendFile = function (uri, name, mime, extension) {
        return new Promise(function (resolve, reject) {
            return WebimNative.sendFile(uri, name, mime, extension, reject, resolve);
        });
    };
    RNWebim.addNewMessageListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.NEW_MESSAGE, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.NEW_MESSAGE, listener); });
    };
    RNWebim.addRemoveMessageListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.REMOVE_MESSAGE, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.REMOVE_MESSAGE, listener); });
    };
    RNWebim.addEditMessageListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.EDIT_MESSAGE, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.EDIT_MESSAGE, listener); });
    };
    RNWebim.addDialogClearedListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.CLEAR_DIALOG, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.CLEAR_DIALOG, listener); });
    };
    RNWebim.addTokenUpdatedListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.TOKEN_UPDATED, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.TOKEN_UPDATED, listener); });
    };
    RNWebim.addErrorListener = function (listener) {
        emitter.addListener(types_1.WebimEvents.ERROR, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(types_1.WebimEvents.ERROR, listener); });
    };
    RNWebim.addListener = function (event, listener) {
        emitter.addListener(event, listener);
        return new utils_1.WebimSubscription(function () { return RNWebim.removeListener(event, listener); });
    };
    RNWebim.removeListener = function (event, listener) {
        emitter.removeListener(event, listener);
    };
    RNWebim.removeAllListeners = function (event) {
        emitter.removeAllListeners(event);
    };
    return RNWebim;
}());
exports.RNWebim = RNWebim;
exports.default = RNWebim;
//# sourceMappingURL=webim.js.map