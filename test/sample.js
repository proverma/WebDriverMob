var wMob = require("../lib/WebDriverMob")
    , w = new wMob();

//setting up browsermob and selenium

w.setup().then(seleniumTest, function (error) {
    if(error) {
        console.error(error);
        process.exit(1);
    }

})

//selenium test to get to Page under Test, and record HAR file
function seleniumTest() {
    //get driver with proxy
    var driver = w.getDriver();
    driver.get('http://www.imdb.com');
    driver.getTitle().then(function(data){
        //this could be called multiple times, as and when you want to record har files
        w.writeAndClearHar("imdb-har.json").then(function (data) {
            console.log("done");
            driver.quit().then(function(){
                process.exit();
            });

        });
    });
}