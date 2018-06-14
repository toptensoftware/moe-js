`use strict`
var fs = require('fs');

var Tokenizer = require('./tokenizer').Tokenizer;

var template = fs.readFileSync("testTokens.moe", "utf8");
for (var t of Tokenizer.tokenize(template))
{
    console.log(t);
}

