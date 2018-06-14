`use strict`
var moe = require('./moe');

async function test()
{
    var template = moe.compile(`
    {{#async}}
    {{#code}}
        var promise =  new Promise((resolve, reject) => {
            setTimeout(() => resolve("Hello"), 5000);
        })
    {{/code}}
    
    {{await promise}}
    `);
    console.log(await template({}));
}

test();




/*
var fs = require('fs');

var Tokenizer = require('./tokenizer').Tokenizer;

var template = fs.readFileSync("testTokens.moe", "utf8");
for (var t of Tokenizer.tokenize(template))
{
    console.log(t);
}
*/
