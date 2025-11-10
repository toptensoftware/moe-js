import { test } from "node:test";
import { strict as assert } from "node:assert";
import moe from './index.js';
import { Tokenizer } from './tokenizer.js';
import fs from 'fs';

test("Skip linespace", () => {

    assert.equal(Tokenizer.skipLineSpace(".....     $", 5), 10);
    assert.equal(Tokenizer.skipLineSpace(".....     \r\n", 5), 10);

});

test("Skip whitespace", () => {

    assert.equal(Tokenizer.skipWhiteSpace(".....     $", 5), 10);
    assert.equal(Tokenizer.skipWhiteSpace(".....     \t\r\n", 5), 13);

});

test("Read identifier", () => {

    assert.equal(Tokenizer.readIdentifier(".....identifier ", 5), "identifier");
    assert.equal(Tokenizer.readIdentifier(".....identifier\t", 5), "identifier");
    assert.equal(Tokenizer.readIdentifier(".....identifier()", 5), "identifier");

});

test("Skip String (double quoted)", () => {

    assert.throws(() => Tokenizer.skipString('....."12345\0', 5));
    assert.throws(() => Tokenizer.skipString('....."12345\n', 5));
    assert.throws(() => Tokenizer.skipString('....."12345\r', 5));
    assert.equal(Tokenizer.skipString('....."12345"zzz', 5), 12);
    assert.equal(Tokenizer.skipString('....."1\\"45"zzz', 5), 12);
    assert.equal(Tokenizer.skipString('....."1\\\'45"zzz', 5), 12);

});

test("Skip String (single quoted)", () => {

    assert.throws(() => Tokenizer.skipString(".....'12345\0", 5));
    assert.throws(() => Tokenizer.skipString(".....'12345\n", 5));
    assert.throws(() => Tokenizer.skipString(".....'12345\r", 5));
    assert.equal(Tokenizer.skipString(".....'12345'", 5), 12);
    assert.equal(Tokenizer.skipString(".....'1\\\"45'", 5), 12);
    assert.equal(Tokenizer.skipString(".....'1\\'45'", 5), 12);

});

test("Skip JavaScript", () => {

    assert.equal(Tokenizer.skipJavaScript(".....12345", 5), 10);
    assert.equal(Tokenizer.skipJavaScript(".....12345}", 5), 10);
    assert.equal(Tokenizer.skipJavaScript(".....{12345}}", 5), 12);
    assert.equal(Tokenizer.skipJavaScript(".....{{12345}}}", 5), 14);
    assert.equal(Tokenizer.skipJavaScript(".....(12345)", 5), 12);
    assert.equal(Tokenizer.skipJavaScript(".....(12345))", 5), 12);
    assert.equal(Tokenizer.skipJavaScript(".....((12345)))", 5), 14);
    assert.equal(Tokenizer.skipJavaScript(".....[12345]", 5), 12);
    assert.equal(Tokenizer.skipJavaScript(".....[12345]]", 5), 12);
    assert.equal(Tokenizer.skipJavaScript(".....[[12345]]]", 5), 14);
    assert.equal(Tokenizer.skipJavaScript(".....'\\''", 5), 9);
    assert.equal(Tokenizer.skipJavaScript('....."\\""', 5), 9);
});

test("Skip String (template string)", () => {

    assert.throws(() => Tokenizer.skipTemplateString("`.....\0", 5))

    assert.equal(Tokenizer.skipTemplateString(".....`123\r5`zzz", 5), 12);
    assert.equal(Tokenizer.skipTemplateString(".....`123\n5`zzz", 5), 12);
    assert.equal(Tokenizer.skipTemplateString(".....`123\n5`zzz", 5), 12);
    assert.equal(Tokenizer.skipTemplateString(".....`123${expr}456`zzz", 5), 20);
    assert.equal(Tokenizer.skipTemplateString(".....`123${'``'}456`zzz", 5), 20);
    assert.equal(Tokenizer.skipTemplateString('.....`123${"``"}456`zzz', 5), 20);
    assert.equal(Tokenizer.skipTemplateString('.....`123${{{}}}456`zzz', 5), 20);
    assert.equal(Tokenizer.skipTemplateString('.....`\\${${expr}456`zzz', 5), 20);
    
});

test("Consume line space", () => {

    assert.deepEqual(Tokenizer.consumeLineSpace("     12345     ", 5, 10), [0, 15]);
    assert.deepEqual(Tokenizer.consumeLineSpace("     12345     \r\n", 5, 10), [0, 17]);
    assert.deepEqual(Tokenizer.consumeLineSpace("\r\n   12345     \r\n", 5, 10), [2, 17]);
    assert.deepEqual(Tokenizer.consumeLineSpace("pre  12345     \r\n", 5, 10), [5,10]);
    assert.deepEqual(Tokenizer.consumeLineSpace("     12345 post\r\n", 5, 10), [5,10]);

});

test("Tokenizer", () => {

    var template = fs.readFileSync("testTokens.moe", "utf8");
    template = template.replace("\r\n", "\n");
    var asserted = [
        { kind: 'literal', text: 'line1\n' },
        { kind: '{{}}', expression: 'expr' },
        { kind: '{{{}}}', expression: 'expr' },
        { kind: 'literal', text: '\n' },
        { kind: '#if', expression: 'something'},
        { kind: '#else', expression: '' },
        { kind: '#else', expression: '' },
        { kind: '#else', expression: '' },
        { kind: '#elseif', expression: '' },
        { kind: '/if' },
        { kind: '{{}}', expression: '"{{"' },
        { kind: '{{}}', expression: '"}}"' },
        { kind: 'literal', text: 'pre' },
        { kind: '{{}}', expression: 'blah' },
        { kind: 'literal', text: 'post\n' },
        { kind: 'literal', text: 'RAW {{ }} TEXT' },
        { kind: 'literal', text: '\n' },
        { kind: '#code', text: 'This is some code {{#if this should be ignore by the tokenizer}}\n' },
        { kind: '>', expression: '"Partial"' },
    ]

    var actual = [];
    for (var token of Tokenizer.tokenize(template))
    {
        delete token.offset;
        actual.push(token);
    }

    assert.deepEqual(actual, asserted);
});


test("Basic output", () => {
    assert.equal(moe.compile("<html>")({}), "<html>");
});

test("Escaped text", () => {
    assert.equal(moe.compile("<p>{{model.x}}</p>")({x:"<br/>"}), "<p>&lt;br/&gt;</p>");
})

test("Raw text", () => {
    assert.equal(moe.compile("<p>{{{model.x}}}</p>")({x:"<br/>"}), "<p><br/></p>");
})

test("Comments (single line)", () => {
    var template = moe.compile(`
    PRE
    {{!-- Comment --}}
    POST
    `);
    
    var result = template({});

    assert.match(result, /PRE/);
    assert.doesNotMatch(result, /Comment/);
    assert.match(result, /POST/);
})

test("If Block (true)", () => {

    var template = moe.compile(`
    {{#if model.x}}
    TRUE
    {{/if}}
    `);
    
    var result = template({ 
        x: true 
    });

    assert.match(result, /TRUE/);
});


test("If Block (false)", () => {

    var template = moe.compile(`
    {{#if model.x}}
    TRUE
    {{/if}}
    `);
    
    var result = template({ 
        x: false 
    });

    assert.doesNotMatch(result, /TRUE/);
});

test("Unless Block (true)", () => {

    var template = moe.compile(`
    {{#unless model.x}}
    TRUE
    {{/unless}}
    `);
    
    var result = template({ 
        x: true 
    });

    assert.doesNotMatch(result, /TRUE/);
});


test("Unless Block (false)", () => {

    var template = moe.compile(`
    {{#unless model.x}}
    TRUE
    {{/unless}}
    `);
    
    var result = template({ 
        x: false 
    });

    assert.match(result, /TRUE/);
});

test("If/Else Block (true)", () => {

    var template = moe.compile(`
    {{#if model.x}}
    TRUE
    {{#else}}
    FALSE
    {{/if}}
    `);
    
    var result = template({ 
        x: true 
    });

    assert.match(result, /TRUE/);
});

test("If/Else Block (false)", () => {

    var template = moe.compile(`
    {{#if model.x}}
    TRUE
    {{#else}}
    FALSE
    {{/if}}
    `);
    
    var result = template({ 
        x: false 
    });

    assert.match(result, /FALSE/);
});

test("If/Else Block (using ^)", () => {

    var template = moe.compile(`
    {{#if model.x}}
    TRUE
    {{^}}
    FALSE
    {{/if}}
    `);
    
    var result = template({ 
        x: true 
    });

    assert.match(result, /TRUE/);
});




test("If/ElseIf Block (true)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{#elseif model.x == 1}}
    ONE
    {{/if}}
    `);
    
    var result = template({ 
        x: 0
    });

    assert.match(result, /ZERO/);
    assert.doesNotMatch(result, /ONE/);
});

test("If/ElseIf Block (false, true)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{#elseif model.x == 1}}
    ONE
    {{/if}}
    `);
    
    var result = template({ 
        x: 1
    });

    assert.doesNotMatch(result, /ZERO/);
    assert.match(result, /ONE/);
});


test("If/ElseIf Block (using ^if)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{^if model.x == 1}}
    ONE
    {{/if}}
    `);
    
    var result = template({ 
        x: 0
    });

    assert.match(result, /ZERO/);
    assert.doesNotMatch(result, /ONE/);
});

test("If/ElseIf Block (0)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{#elseif model.x == 1}}
    ONE
    {{#else}}
    OTHER
    {{/if}}
    `);
    
    var result = template({ 
        x: 0
    });

    assert.match(result, /ZERO/);
    assert.doesNotMatch(result, /ONE/);
    assert.doesNotMatch(result, /OTHER/);
});

test("If/ElseIf/Else Block (1)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{#elseif model.x == 1}}
    ONE
    {{#else}}
    OTHER
    {{/if}}
    `);
    
    var result = template({ 
        x: 1
    });

    assert.doesNotMatch(result, /ZERO/);
    assert.match(result, /ONE/);
    assert.doesNotMatch(result, /OTHER/);
});

test("If/ElseIf/Else Block (2)", () => {

    var template = moe.compile(`
    {{#if model.x == 0}}
    ZERO
    {{#elseif model.x == 1}}
    ONE
    {{#else}}
    OTHER
    {{/if}}
    `);
    
    var result = template({ 
        x: 2
    });

    assert.doesNotMatch(result, /ZERO/);
    assert.doesNotMatch(result, /ONE/);
    assert.match(result, /OTHER/);
});


test("Each Block (Array)", () => {

    var template = moe.compile("{{#each model.x}}{{item}}{{/each}}");
    
    var result = template({ 
        x: ["Apples", "Pears", "Bananas"] 
    });

    assert(result, "ApplesPearsBananas");

});

test("Each/Else Block (true)", () => {

    var template = moe.compile(`
    {{#each model.x}}
    {{item}}
    {{#else}}
    FALSE
    {{/each}}
    `);
    
    var result = template({ 
        x: ["Apples", "Pears", "Bananas"] 
    });

    assert.doesNotMatch(result, /FALSE/);
});

test("Each/Else Block (false)", () => {

    var template = moe.compile(`
    {{#each model.x}}
    {{item}}
    {{#else}}
    FALSE
    {{/each}}
    `);
    
    var result = template({ 
        x: [] 
    });

    assert.match(result, /FALSE/);
});

test("Each Block (key/value)", () => {

    var template = moe.compile(`
    {{#each model.x}}
    {{item.key}}={{item.value}}
    {{/each}}
    `);
    
    var result = template({ 
        x: {
            "Apples": "Red",
            "Bananas": "Yellow",
            "Oranges": "Orange"
        }
    });

    assert.match(result, /Apples\=Red/);
    assert.match(result, /Bananas\=Yellow/);
    assert.match(result, /Oranges\=Orange/);
});


test("Each Block (generator)", () => {

    var template = moe.compile(`
    {{#each model.x}}
    {{item.key}}={{item.value}}
    {{/each}}
    `);
    
    var result = template({ 
        x: function*(){
            yield { key: "Apples", value: "Red" };
            yield { key: "Bananas", value: "Yellow" };
            yield { key: "Oranges", value: "Orange" };
        }
    });

    assert.match(result, /Apples\=Red/);
    assert.match(result, /Bananas\=Yellow/);
    assert.match(result, /Oranges\=Orange/);
});


test("Each Block (nested with loop var)", () => {

    var template = moe.compile(`
    {{#each x in [1,2,3]}}
    {{#each y in ['a', 'b']}}
    {{x}}{{y}}
    {{/each}}
    {{/each}}
    `);
    
    var result = template({});

    assert.match(result, /1a/);
    assert.match(result, /1b/);
    assert.match(result, /2a/);
    assert.match(result, /2b/);
    assert.match(result, /3a/);
    assert.match(result, /3b/);
});

test("Each Block (scope index)", () => {

    var template = moe.compile(`
    {{#each x in [1,2,3]}}
    {{scope.index}}={{x}}
    {{/each}}
    `);
    
    var result = template({});

    assert.match(result, /0=1/);
    assert.match(result, /1=2/);
    assert.match(result, /2=3/);
});

test("Each Block (scope first)", () => {

    var template = moe.compile(`
    {{#each x in [1,2,3]}}
    {{#if scope.first}}
        {{scope.index}}={{x}}
    {{#else}}
        {{scope.index}}:{{x}}
    {{/if}}
    {{/each}}
    `);
    
    var result = template({});

    assert.match(result, /0=1/);
    assert.match(result, /1:2/);
    assert.match(result, /2:3/);
});

test("Each Block (scope last)", () => {

    var template = moe.compile(`
    {{#each x in [1,2,3]}}
    {{#if scope.last}}
        {{scope.index}}={{x}}
    {{#else}}
        {{scope.index}}:{{x}}
    {{/if}}
    {{/each}}
    `);
    
    var result = template({});

    assert.match(result, /0:1/);
    assert.match(result, /1:2/);
    assert.match(result, /2=3/);
});


test("Code Block", () => {

    var template = moe.compile(`
    {{#code}}
    function FormatPrice(val)
    {
        if (val == 0)
            return "-";
        else
            return "$" + val.toFixed(2);
    }    
    {{/code}}
    ##{{FormatPrice(model.x)}}##
    `);
    
    var result = template({ 
        x: 12.9999
    });

    assert.match(result, /##\$13.00##/);
});

test("With Block (named item)", () => {
    var template = moe.compile(`
    {{#with x as model.obj}}
    <p>{{x.name}} - {{x.color}}</p>
    {{/with}}
    `);
    
    var result = template({ 
        obj: {
            name: "Apple",
            color: "Red",
        }
    });

    assert.match(result, /Apple - Red/);

});

test("With Block (unnamed item)", () => {
    var template = moe.compile(`
    {{#with model.obj}}
    <p>{{item.name}} - {{item.color}}</p>
    {{/with}}
    `);
    
    var result = template({ 
        obj: {
            name: "Apple",
            color: "Red",
        }
    });

    assert.match(result, /Apple - Red/);

});

test("With/Else Block (true)", () => {
    var template = moe.compile(`
    {{#with model.obj}}
    <p>{{item.name}} - {{item.color}}</p>
    {{#else}}
    <p>FALSE</p>
    {{/with}}
    `);
    
    var result = template({ 
        obj: {
            name: "Apple",
            color: "Red",
        }
    });

    assert.match(result, /Apple - Red/);

});

test("With/Else Block (false)", () => {
    var template = moe.compile(`
    {{#with model.obj}}
    <p>{{item.name}} - {{item.color}}</p>
    {{#else}}
    <p>FALSE</p>
    {{/with}}
    `);
    
    var result = template({ 
        obj: null
    });

    assert.match(result, /FALSE/);

});

test("Async Templates", async () => {

    var template = moe.compile(`
    {{await model.promise}}
    `, true);

    assert(template.isAsync, true);
    
    var result = await template({ 
        promise: new Promise((resolve, reject) => {
            setTimeout(() => resolve("Hello"), 50);
        }),
    });

    assert.match(result, /Hello/);

});

test("Capture Block", () => {
    var template = moe.compile(`
    {{#capture model.captured}}
    <p>{{model.name}} - {{model.color}}</p>
    {{/capture}}
    `);

    var model = { 
        name: "Apple",
        color: "Red",
    };
    
    var result = template(model);

    assert.equal(result.trim(), "");
    assert.match(model.captured, /Apple - Red/);
});

test("Express", () => {

    moe.express({
    });

});

