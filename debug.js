`use strict`
var moe = require('./moe');

    var template = moe.compile(`
<div>
    {{#if model.inStock}}
    IN STOCK
    {{^}}
    OUT OF STOCK
    {{/if}}
<div>
    `);

    console.log(template({inStock:true}));




/*
var fs = require('fs');

var Tokenizer = require('./tokenizer').Tokenizer;

var template = fs.readFileSync("testTokens.moe", "utf8");
for (var t of Tokenizer.tokenize(template))
{
    console.log(t);
}
*/
