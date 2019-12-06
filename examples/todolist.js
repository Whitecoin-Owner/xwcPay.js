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
        contractAddress: 'XWCCWspQL9YckdSr3Weekxjr5yqr7ymFUC8d8',
        myAddress: null,
        myPubKey: null,
        contractXwcBalance: 0,

        apisInstance: null,
        nodeClient: null,

        lastSerialNumber: null,
        lastResponse: null,
        lastTxid: null,

        queryForm: {},
        createForm: {},
        myTodoList: [],
    },
    mounted() {
        xwcPay.onConnectedWallet()
            .then(() => {
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
                                this.queryForm.address = address;
                                this.myPubKey = pubKey;
                                this.loadInfo();
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
            });
    },
    methods: {
        waitTxByPayId(payId) {
            setTimeout(() => {
                xwcPay.queryPayInfo(payId, {
                    callback: 'http://wallet.xwc.cash/api',
                }).then((result) => {
                    console.log("get tx by payId result", result);
                }).catch((e) => {
                    console.log("get tx by payId error", e);
                })
            }, 6000);
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
        donateToMiner() {
            this.nodeClient.afterInited()
                .then(() => {
                    var assetId = "1.3.0";
                    xwcPay.lockBalanceToMiner('miner0', assetId, 1, {
                        listener: this.xwcPayListener.bind(this)
                    });
                }).catch(this.showError);
        },
        signTodoItem() {
            const content = this.createForm.content || '';
            if (content.length < 1) {
                this.showError("content can't be empty");
                return;
            }
            if (content.length > 400) {
                this.showError("too long content");
                return;
            }
            // const contentHex = TransactionHelper.bytes_to_hex(content);
            xwcPay.signBufferText(content, {
                listener: this.xwcPayListener.bind(this)
            });
        },
        createTodoItem() {
            const content = this.createForm.content || '';
            if (content.length < 1) {
                this.showError("content can't be empty");
                return;
            }
            if (content.length > 400) {
                this.showError("too long content");
                return;
            }
            this.nodeClient.afterInited()
                .then(() => {
                    var assetId = "1.3.0";
                    var to = this.contractAddress;
                    var value = 0;
                    var callFunction = "addTodo"
                    var callArgs = content;
                    xwcPay.simulateCall(assetId, to, value, callFunction, callArgs, {
                        gasPrice: '0.00000001',
                        gasLimit: 5000,
                        listener: this.xwcPayListener.bind(this)
                    });
                }).catch(this.showError);
        },
        queryTodos() {
            this.loadInfo();
        },
        loadInfo() {
            this.nodeClient.afterInited()
                .then(() => {
                    this.nodeClient.execDbApi('get_dynamic_global_properties').then(info => {
                        console.log("info", info);
                    }).catch(this.showError);
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
                    const dummyPubKey = 'XWC8mT7XvtTARjdZQ9bqHRoJRMf7P7azFqTQACckaVenM2GmJyxLh';
                    this.nodeClient.invokeContractOffline(
                        this.myPubKey || dummyPubKey,
                        this.contractAddress,
                        'listTodosOfUser',
                        this.queryForm.address || this.myAddress
                    ).then(result => {
                        console.log("listTodosOfUser result: ", result);
                        this.myTodoList = JSON.parse(result);
                    }).catch(this.showError);

                }).catch(this.showError);
        },
        showError(err) {
            alert(JSON.stringify(err));
        }
    }
});