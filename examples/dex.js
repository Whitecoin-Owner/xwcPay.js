const XwcPay = require("xwcpay");
const xwcPay = new XwcPay();

const {
    PrivateKey,
    PublicKey,
    Address,
    key,
    TransactionBuilder,
    TransactionHelper,
    NodeClient,
    Apis,
    ChainConfig
} = xwc_js;

const orderSigCallbacks = {}; // orderNonce => Function<signature, error, void_result>
let lastSigOrderNonce = null;

function bindOrderSigCallback(orderNonce, callback) {
    orderSigCallbacks[orderNonce] = callback;
    lastSigOrderNonce = orderNonce;
}

const app = new Vue({
    el: '#app',
    data: {
        contractAddress: '',
        myAddress: null,
        myPubKey: null,

        apisInstance: null,
        nodeClient: null,

        lastSerialNumber: null,
        lastResponse: null,
        lastTxid: null,

        addOrderForm: {
            tradeAsset: 'BTC',
            baseAsset: 'XWC',
            marketPair: 'BTC/XWC',
            price: 4000,
            amount: null,
            tradeAssetPricision: 100000000,
            baseAssetPrecision: 100000,
        },
        orderBook: {
            asks: [],
            bids: [],
        },
        currentUserBalancesInDex: {},
        currentUserLockedBalancesInDex: {},
        latestMarketPrices: {},
        myActiveOrders: [],

        dexEngineEndpoint: "http://127.0.0.1:40000/api",
        dexContractAddress: "XWCTCMA8uQe1rehFHq8hKJAu8RASYZeGvdtTLH",
    },
    mounted() {
        this.getDexInfo();
        xwcPay.getConfig()
            .then((config) => {
                console.log('config', config);
                if (!config) {
                    this.showError("please install xwc extension wallet first");
                    return;
                }

                this.xwcConfig = config;
                ChainConfig.setChainId(config.chainId);
                this.apisInstance = Apis.instance(config.network, true);
                this.nodeClient = new NodeClient(this.apisInstance);
                this.loadInfo();

                xwcPay.getUserAddress()
                    .then(({ address, pubKey, pubKeyString }) => {
                        console.log('address', address);
                        console.log('pubKey', pubKey);
                        console.log('pubKeyStr', pubKeyString);
                        this.myAddress = address;
                        this.myPubKey = pubKey;
                        this.updateUserBalancesInDex();
                        this.updateUserActiveOrders();
                        this.updateLatestPrice();
                    }, (err) => {
                        this.showError(err);
                    });

            }, (err) => {
                console.log('get config error', err);
                this.showError(err);
                const config = xwcPay.defaultConfig;

                this.xwcConfig = config;
                ChainConfig.setChainId(config.chainId);
                this.apisInstance = Apis.instance(config.network, true);
                this.nodeClient = new NodeClient(this.apisInstance);
                this.loadInfo();
            })

    },
    methods: {
        waitTxByPayId(payId) {
            setTimeout(() => {
                xwcPay.queryPayInfo(payId, {
                    callback: 'http://wallet.xwc.cash/api',
                }).then((result) => {
                    console.log("get tx by payId result", result);
                    this.updateUserBalancesInDex();
                }).catch((e) => {
                    console.log("get tx by payId error", e);
                })
            }, 6000);
        },
        xwcSigListener(serialNumber, resp, name) {
            console.log("resp: " + JSON.stringify(resp));
            console.log("name: " + name);
            this.lastSerialNumber = serialNumber;
            console.log("serialNumber: ", serialNumber);
            // you can get txid by serialNumber(on web or mobile app) or use txid(only on web)
            this.waitTxByPayId(serialNumber);
            if (name === 'sig') {
                const sigHex = resp;
                console.log("got sig", sigHex);
                const lastSigOrderKey = lastSigOrderNonce;
                if (lastSigOrderKey) {
                    const callback = orderSigCallbacks[lastSigOrderKey];
                    if (callback) {
                        callback(sigHex);
                    }
                }
            }
            // TODO: orderSigCallbacks 中order签名的超时失败回调
        },
        xwcPayListener(serialNumber, resp, name) {
            console.log("resp: " + JSON.stringify(resp));
            console.log("name: " + name);
            this.lastSerialNumber = serialNumber;
            console.log("serialNumber: ", serialNumber);
            // you can get txid by serialNumber(on web or mobile app) or use txid(only on web)
            this.waitTxByPayId(serialNumber);
            if (name === 'txhash') {
                const txid = resp;
                this.lastTxid = txid;
                xwcPay.waitTransaction(this.nodeClient, txid)
                    .then((tx) => {
                        console.log("found tx", tx);
                        alert("transaction successfully");
                        this.loadInfo();
                    }, this.showError);
            } else if (name === 'sig') {
                const sigHex = resp;
                console.log("got sig", sigHex);
                this.showError("Siganture: " + sigHex);
            } else {
                this.lastResponse = resp;
            }
        },

        loadInfo() {
            this.nodeClient.afterInited()
                .then(() => {
                    this.nodeClient.execDbApi('get_dynamic_global_properties').then(info => {
                        console.log("info", info);
                    }).catch(this.showError);

                    const dummyPubKey = 'XWC8mT7XvtTARjdZQ9bqHRoJRMf7P7azFqTQACckaVenM2GmJyxLh';

                    this.updateDexStatus();

                }).catch(this.showError);

            this.updateOrderbook();
            xwcPay.onConnectedWallet()
                .then(() => {
                    const optionalNodeRpcUrl = 'ws://192.168.1.121:30000';
                    const optionalNodeClientRpcUrl = 'http://192.168.1.121:30001';
                    xwcPay.setConfig('2c5729a8f02e0431233528a3db625a7b0f83aa7c9f561d9bd73886d993a57161', 'regtest121', optionalNodeRpcUrl, optionalNodeClientRpcUrl)
                        .then(() => {
                            console.log("set config done");
                        });
                });
        },
        showError(err) {
            alert(JSON.stringify(err));
        },
        requestDexRpc(method, params) {
            return axios.post(this.dexEngineEndpoint, {
                method: method,
                params: params,
                id: 1,
            })
                .then((res) => {
                    return res.data;
                })
                .then((res) => {
                    return new Promise((resolve, reject) => {
                        if (!res) {
                            reject("invalid jsonrpc response format");
                            return;
                        }
                        if (res.error) {
                            reject(res.error);
                            return;
                        }
                        resolve(res.result);
                    });
                });
        },
        updateDexStatus() {
            this.requestDexRpc("GetStatus", {})
                .then((status) => {
                    console.log("status", status)
                }).catch(this.showError);
        },
        updateOrderbook() {
            this.requestDexRpc("QueryAsks", {
                baseAssetSymbol: this.addOrderForm.baseAsset,
                tradeAssetSymbol: this.addOrderForm.tradeAsset,
                limit: 5,
                pricePosition: 5,
            }).then(asks => {
                console.log("asks", asks);
                this.orderBook.asks = asks.items;
            }).catch(this.showError.bind(this));
            this.requestDexRpc("QueryBids", {
                baseAssetSymbol: this.addOrderForm.baseAsset,
                tradeAssetSymbol: this.addOrderForm.tradeAsset,
                limit: 5,
                pricePosition: 5,
            }).then(bids => {
                console.log("bids", bids);
                this.orderBook.bids = bids.items;
            }).catch(this.showError.bind(this));
        },
        updateUserActiveOrders() {
            this.requestDexRpc("QueryUserActiveOrders", {
                userAddr: this.myAddress,
                limit: 10,
            }).then(orders => {
                console.log("user active orders", orders);
                this.myActiveOrders = orders;
            }).catch(this.showError.bind(this));
        },
        updateUserBalancesInDex() {
            if (!this.myAddress) {
                return;
            }
            // query user balances by dex rpc
            this.requestDexRpc("QueryUserBalancesInDex", {
                userAddr: this.myAddress,
            }).then(balances => {
                console.log("user balances", balances);
                const userBalances = balances.userBalances || {};
                const userNotLockedBalances = balances.userNotLockedBalances || {};
                for (const assetSymbol in userBalances) {
                    this.currentUserBalancesInDex[assetSymbol] = userBalances[assetSymbol];
                }
                for (const assetSymbol in userNotLockedBalances) {
                    this.currentUserLockedBalancesInDex[assetSymbol] = (this.currentUserBalancesInDex[assetSymbol] || 0) - userNotLockedBalances[assetSymbol];
                }
                this.$forceUpdate();
            }).catch(this.showError.bind(this));

            // const assets = [this.addOrderForm.tradeAsset, this.addOrderForm.baseAsset];
            // for (const assetSymbol of assets) {
            //     this.nodeClient.afterInited()
            //         .then(() => {
            //             const dummyPubKey = 'XWC8mT7XvtTARjdZQ9bqHRoJRMf7P7azFqTQACckaVenM2GmJyxLh';
            //             this.nodeClient.invokeContractOffline(
            //                 this.myPubKey || dummyPubKey,
            //                 this.dexContractAddress,
            //                 'balanceOf',
            //                 this.myAddress + "," + assetSymbol
            //             ).then(result => {
            //                 console.log("balance result: ", result);
            //                 this.currentUserBalancesInDex[assetSymbol] = result;
            //                 this.$forceUpdate();
            //             }).catch((err)=>{
            //                 console.log("error", err);
            //             });
            //         }).catch(this.showError);
            // }
        },
        // TODO: websocket监听价格变化和order变化

        updateLatestPrice() {
            this.requestDexRpc("QueryMarketLatestPrice", {
                tradeAssetSymbol: this.addOrderForm.tradeAsset,
                baseAssetSymbol: this.addOrderForm.baseAsset,
            }).then(price => {
                console.log("latest price", price);
                this.latestMarketPrices[this.addOrderForm.marketPair] = price;
                this.$forceUpdate();
            }).catch(this.showError.bind(this));
        },
        getDexInfo() {
            this.requestDexRpc("QueryDexInfo", {
            }).then(info => {
                console.log("dex info", info);
                this.dexInfo = info;
                this.dexContractAddress = info.dexContractAddress;
            }).catch(this.showError.bind(this));
        },
        // TODO: 展示用户成交历史
        depositToContract() {
            xwcPay.transferToContract('1.3.0', this.dexContractAddress, 10, [], {
                listener: this.xwcPayListener.bind(this)
            });
        },
        cancelOrder(order) {
            // 撤单
            console.log("to cancel order", order)
            const orderId = order.ExtraInfo.OrderId;
            const orderRawStr = order.ExtraInfo.OrderInfoStr;
            const orderSigHex = order.ExtraInfo.SigHex;
            const cancelOrderStr = `{"type":"cancel","orderId":"${orderId}"}`;
            // 请求钱包签名，签名结果交给撮合引擎撤单
            xwcPay.signBufferText(cancelOrderStr, {
                listener: this.xwcSigListener.bind(this)
            });
            bindOrderSigCallback(cancelOrderStr, (sig, err) => {
                console.log("cancel order sig callback", sig, err);
                // submit order info and sig to dex engine
                this.requestDexRpc("CancelOrder", {
                    orderInfoStr: orderRawStr,
                    orderSigHex: orderSigHex, 
                    cancelOrderSigHex: sig,
                }).then(result => {
                    console.log("cancel order result", result);
                    this.showError("cancel order successfully");
                    this.updateOrderbook();
                    this.updateUserActiveOrders();
                    this.updateLatestPrice();
                    this.updateUserBalancesInDex();
                }).catch(this.showError.bind(this));
            });
            
        },
        addOrder(form, isBuy) {
            const tradeAsset = form.tradeAsset;
            const baseAsset = form.baseAsset;
            const price = form.price;
            const priceNum = parseFloat(price);
            const tradeAssetPricision = form.tradeAssetPricision;
            const baseAssetPrecision = form.baseAssetPrecision;
            const amount = parseFloat(form.amount);
            if (!amount || amount <= 0) {
                this.showError("invalid amount")
                return;
            }
            if (!priceNum || priceNum <= 0) {
                this.showError("invalid price");
                return;
            }
            const fullAmount = parseInt(amount * tradeAssetPricision);
            const fullBaseAmount = parseInt(priceNum * amount * baseAssetPrecision);
            // make order string
            const orderNonce = new Date().getTime().toString();
            const orderInfo = {
                purchaseAsset: isBuy ? tradeAsset : baseAsset,
                purchaseNum: isBuy ? fullAmount : fullBaseAmount,
                payAsset: isBuy ? baseAsset : tradeAsset,
                payNum: isBuy ? fullBaseAmount : fullAmount,
                nonce: orderNonce,
                relayer: 'XWCTNa5ZMhvFYXSYN4E2sAKqDVBKZgU9AGEBfZ',
                fee: "0",
                type: isBuy ? "buy" : "sell",
                expiredAt: parseInt(new Date().getTime() / 1000 + 3600 * 24), // 1 day
                version: 1,
            };
            const orderStr = JSON.stringify(orderInfo);
            xwcPay.signBufferText(orderStr, {
                listener: this.xwcSigListener.bind(this)
            });
            bindOrderSigCallback(orderNonce, (sig, err) => {
                console.log("order sig callback", sig, err);
                // submit order info and sig to dex engine
                this.requestDexRpc("SubmitOrder", {
                    orderRawStr: orderStr,
                    sigHex: '0x' + sig
                }).then((orderId) => {
                    console.log("order " + orderId + " submited to dex engine");
                    // update order book and current user order history
                    this.updateOrderbook();
                    this.updateUserActiveOrders();
                    this.updateLatestPrice();
                    this.updateUserBalancesInDex();
                }).catch(this.showError.bind(this));
            });
        },
        addBuyOrder() {
            return this.addOrder(this.addOrderForm, true);
        },
        addSellOrder() {
            return this.addOrder(this.addOrderForm, false);
        },
    }
});