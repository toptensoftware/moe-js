`use strict`
var moe = require('./moe');

var template = moe.compile(`
{{#capture model.scripts}}
<p>{{model.name}} - {{model.color}}</p>
{{/capture}}
{{{model.scripts}}}
`);

var result = template({ 
    name: "Apple",
    color: "Red",
});

console.log(template.impl.toString());

console.log(result);

