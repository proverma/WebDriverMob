
var webdriver = require('selenium-webdriver')
    , request = require('request')
    , BROWSERMOB_PROXY_HOST = "http://localhost"
    , spawn = require('child_process').spawn
    , q = require('q')
    , seleniumServer = require('selenium-standalone')
    , _ = require('lodash')
    , url = require('url')
    , fs = require("fs-extra");
;

function WebDriverMob(browserMobPort, seleniumCapabilities) {


    this._caps = seleniumCapabilities ? seleniumCapabilities : {};
    this._bmPort = browserMobPort ? browserMobPort : 8080;
    this.proxyHost = BROWSERMOB_PROXY_HOST + ":" + this._bmPort;

    var self = this;

    process.on('exit', function (code) {
        self.killProcesses();
    });

};

WebDriverMob.prototype.setup = function () {

    var defer = q.defer(),
        self = this;

    this.startBrowserMob(this._bmPort)
        .timeout(5000, "Unable to start Browsermob")
        .then(this.startSeleniumServer, this.exitOnError)
        .timeout(5000, "Unable to Start SeleniumServer")
        .then(function () {
            return self.startProxy(self.proxyHost);
        }, this.exitOnError)
        .then(function (proxyPort) {
            self.proxyPort = proxyPort;
            return self.startRecordingHar(self.proxyHost, self.proxyPort);
        }, this.exitOnError)
        .then(function () {
            var proxyUrl = url.parse(self.proxyHost).hostname + ":" + self.proxyPort;
            return self.setupSelenium(url.parse(self.proxyHost).hostname + ":" + self.proxyPort, self._caps);
        }, this.exitOnError)
        .then(function () {
            defer.resolve();
        }, this.exitOnError);

    return defer.promise;

};

WebDriverMob.prototype.exitOnError = function (err) {
    console.error(err);
    process.kill(this._browserMob);
    //this._selenium.kill();
    process.exit(1);
};

WebDriverMob.prototype.killProcesses = function () {

    process.kill(this._browserMob);
    // this._selenium.kill();
};

WebDriverMob.prototype.getDriver = function (err) {
    return this._driver;
};


WebDriverMob.prototype.startBrowserMob = function (port) {

    var defer = q.defer(),
        bmPath,
        fs = require("fs");

    bmPath = fs.existsSynch("./browserMob/bin/browsermob-proxy") ? "./browserMob/bin/browsermob-proxy" : "./browserMob/bin/browsermob-proxy";


    this._browserMob = spawn("sh", ["./browserMob/bin/browsermob-proxy"]);

    this._browserMob.stdout.on('data', function (data) {
        //console.log('stdout: ' + data);
        if (data.indexOf("Started SelectChannelConnector@") > 0) {
            defer.resolve();
        }
    });
    this._browserMob.stderr.on('data', function (data) {
        //console.error('stderr: ' + data);
        if (data.toString().indexOf("Started SelectChannelConnector@") > 0) {
            console.log("BrowserMob Service Started");
            defer.resolve();
        }
    });

    this._browserMob.on('close', function (code) {
        console.log('BrowserMob  exited with code ' + code);
    });

    return defer.promise;
};

WebDriverMob.prototype.startSeleniumServer = function () {
    var defer = q.defer();

    this._selenium = seleniumServer({ stdio: 'pipe' });

    this._selenium.stdout.on('data', function (data) {

        if (data.toString().indexOf("Started org.openqa.jetty.jetty.Server@") > 0) {
            console.log("Selenium Server Started");
            defer.resolve();
        }
    });

    this._selenium.on('close', function (code) {
        console.log('Selenium Server  exited with code ' + code);
    });

    return defer.promise;
};

WebDriverMob.prototype.startProxy = function (proxyHost) {

    var defer = q.defer();

    request.post(proxyHost + "/proxy", function (error, httpResponse, body) {
        if (error) {
            console.log("REJECT");
            defer.reject(new Error(error));
        } else {

            port = JSON.parse(body).port;

            if (port > 0) {
                console.log("Running HTTP Proxy on port :" + port);
                defer.resolve(port);
            } else {
                defer.reject(new Error("Invalid Port Found"));
            }
        }

    });

    return defer.promise;

};


WebDriverMob.prototype.startRecordingHar = function (proxyHost, proxyPort) {

    var defer = q.defer();

    request.put(proxyHost + "/proxy/" + proxyPort + "/" + "har", function (err, httpResponse, data) {
        if (err) {
            defer.reject(new Error(err));
        } else {
            defer.resolve();
        }

    });

    return defer.promise;

};

WebDriverMob.prototype.writeAndClearHar = function (filePath) {
    var defer = q.defer();
    var self = this;
    console.log(this.proxyHost + "/proxy/" + this.proxyPort + "/" + "har");

    request.put(self.proxyHost + "/proxy/" + self.proxyPort + "/" + "har", function (err, httpResponse, data) {

        if (err) {
            defer.reject(new Error(err));
        } else {
            if (filePath) {
                console.log("Writing Har file at :" + filePath);
                fs.outputFileSync(filePath, data, 'utf8');
            }
            defer.resolve(data);
        }

    });


    return defer.promise;
};


WebDriverMob.prototype.writeHar = function (filePath) {
    var defer = q.defer();
    request.get(this.proxyHost + "/proxy/" + this.proxyPort + "/" + "har", function (err, resp, data) {

        if (err) {
            defer.reject(new Error(err));
        } else {
            if (filePath) {
                fs.outputFileSync(filePath, data, 'utf8');
            }
            defer.resolve(data);
        }

    })
    return defer.promise;
};

WebDriverMob.prototype.setupSelenium = function (proxyUrl, _caps) {
    var proxy,
        caps,
        defaultCaps;

    defaultCaps = {
        "platform": "ANY",
        "javascriptEnabled": true,
        "seleniumProtocol": "WebDriver",
        "browserName": "firefox",
        "proxy": {
            "httpProxy": proxyUrl,
            "sslProxy": proxyUrl,
            "proxyType": "manual"
        }
    };

    caps = _.defaults(_caps, defaultCaps);

    this._driver = new webdriver.Builder().
        withCapabilities(caps).
        build()


};

module.exports = WebDriverMob;