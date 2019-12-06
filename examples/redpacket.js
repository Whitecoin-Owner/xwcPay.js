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

const app = new Vue({
    el: '#app',
    data: {
        contractAddress: 'XWCCaPs4VynvySuVAQFEG6jvWML9DggEG3Srm',
        myAddress: null,
        myPubKey: null,
        contractXwcBalance: 0,
        myBonus: 0,
        xwcConfig: null,
        apisInstance: null,
        nodeClient: null,

        lastSerialNumber: null,
        lastResponse: null,
        lastTxid: null,
    },
    mounted() {
        xwcPay.getConfig()
            .then((config) => {
                console.log('config', config);
                if (!config) {
                    alert("please install xwc extension wallet first");
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
        xwcPayListener(serialNumber, resp, name) {
            console.log("resp: " + JSON.stringify(resp));
            this.lastSerialNumber = serialNumber;
            if (name === 'txhash') {
                const txid = resp;
                this.lastTxid = txid;
                xwcPay.waitTransaction(this.nodeClient, txid)
                    .then((tx) => {
                        console.log("found tx", tx);
                        alert("transaction successfully");
                    }, this.showError);
            } else {
                this.lastResponse = resp;
            }
        },
        receiveFromRedPacket() {
            this.nodeClient.afterInited()
                .then(() => {
                    var assetId = "1.3.0";
                    var to = this.contractAddress;
                    var value = 0;
                    var callFunction = "getBonus"
                    var callArgs = "_";
                    xwcPay.simulateCall(assetId, to, value, callFunction, callArgs, {
                        gasPrice: '0.00000001',
                        gasLimit: 5000,
                        listener: this.xwcPayListener.bind(this)
                    });
                }).catch(this.showError);
        },
        depositToRedPacket() {
            this.nodeClient.afterInited()
            .then(() => {
                var assetId = "1.3.0";
                var to = this.contractAddress;
                var value = 1;
                xwcPay.transferToContract(assetId, to, value, [], {
                    gasPrice: '0.00000001',
                    gasLimit: 5000,
                    listener: this.xwcPayListener.bind(this)
                });
            }).catch(this.showError);
        },
        testGetState() {
            this.nodeClient.afterInited()
                .then(() => {
                    var assetId = "1.3.0";
                    var to = this.contractAddress;
                    var value = 0;
                    var callFunction = "getState"
                    var callArgs = "_";
                    xwcPay.simulateCall(assetId, to, value, callFunction, callArgs, {
                        gasPrice: '0.00000001',
                        gasLimit: 5000,
                        listener: this.xwcPayListener.bind(this)
                    });
                }).catch(this.showError);
        },
        loadInfo() {
            this.nodeClient.afterInited()
                .then(() => {
                    this.nodeClient.getContractBalances(this.contractAddress)
                        .then(balances => {
                            console.log("contract balances: ", balances);
                            this.contractXwcBalance = 0;
                            for (const balance of balances) {
                                if (balance.asset_id === '1.3.0') {
                                    this.contractXwcBalance = balance.amount;
                                }
                            }
                        }).catch(this.showError);
                    if (this.myPubKey) {
                        this.nodeClient.invokeContractOffline(
                            this.myPubKey,
                            this.contractAddress,
                            'checkBonus',
                            this.myAddress
                        ).then(result => {
                            console.log("checkBonus result: ", result);
                            this.myBonus = parseInt(result);
                        }).catch(this.showError);
                    }
                }).catch(this.showError);
        },
        showError(err) {
            alert(JSON.stringify(err));
        }
    }
});