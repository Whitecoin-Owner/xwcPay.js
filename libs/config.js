"use strict";

var mainnetUrl = "http://wallet.xwc.cash/api";
var testnetUrl = "http://wallet.xwc.cash/testnet_api";

var payUrl = function(debug) {
    debug = debug || false;
    if (debug) {
        return testnetUrl;
    } else {
        return mainnetUrl;
    }
};

var nanoScheme = function(debug) {
    debug = debug || false;
    if (debug) {
        return "openapp.XWCnano.testnet";
    } else {
        return "openapp.XWCnano";
    }
};

module.exports = {
    payUrl: payUrl,
    nanoScheme: nanoScheme,
    mainnetUrl: mainnetUrl,
    testnetUrl: testnetUrl
};