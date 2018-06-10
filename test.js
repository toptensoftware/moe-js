var moe = require('moe-js');

test("Basic output", () => {
    expect(moe.compile("<html>")({})).toBe("<html>");
});

test("Escaped text", () => {
    expect(moe.compile("<p>{{model.x}}</p>")({x:"<br/>"})).toBe("<p>&lt;br/&gt;</p>");
})

test("Raw text", () => {
    expect(moe.compile("<p>{{{model.x}}}</p>")({x:"<br/>"})).toBe("<p><br/></p>");
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

    expect(result).toMatch(/TRUE/);
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

    expect(result).not.toMatch(/TRUE/);
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

    expect(result).toMatch(/TRUE/);
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

    expect(result).toMatch(/FALSE/);
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

    expect(result).toMatch(/ZERO/);
    expect(result).not.toMatch(/ONE/);
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

    expect(result).not.toMatch(/ZERO/);
    expect(result).toMatch(/ONE/);
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

    expect(result).toMatch(/ZERO/);
    expect(result).not.toMatch(/ONE/);
    expect(result).not.toMatch(/OTHER/);
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

    expect(result).not.toMatch(/ZERO/);
    expect(result).toMatch(/ONE/);
    expect(result).not.toMatch(/OTHER/);
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

    expect(result).not.toMatch(/ZERO/);
    expect(result).not.toMatch(/ONE/);
    expect(result).toMatch(/OTHER/);
});


test("Each Block (Array)", () => {

    var template = moe.compile("{{#each model.x}}{{item}}{{/each}}");
    
    var result = template({ 
        x: ["Apples", "Pears", "Bananas"] 
    });

    expect(result).toBe("ApplesPearsBananas");

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

    expect(result).not.toMatch(/FALSE/);
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

    expect(result).toMatch(/FALSE/);
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

    expect(result).toMatch(/Apples\=Red/);
    expect(result).toMatch(/Bananas\=Yellow/);
    expect(result).toMatch(/Oranges\=Orange/);
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

    expect(result).toMatch(/Apples\=Red/);
    expect(result).toMatch(/Bananas\=Yellow/);
    expect(result).toMatch(/Oranges\=Orange/);
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

    expect(result).toMatch(/1a/);
    expect(result).toMatch(/1b/);
    expect(result).toMatch(/2a/);
    expect(result).toMatch(/2b/);
    expect(result).toMatch(/3a/);
    expect(result).toMatch(/3b/);
});

test("Each Block (scope index)", () => {

    var template = moe.compile(`
    {{#each x in [1,2,3]}}
    {{scope.index}}={{x}}
    {{/each}}
    `);
    
    var result = template({});

    expect(result).toMatch(/0=1/);
    expect(result).toMatch(/1=2/);
    expect(result).toMatch(/2=3/);
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

    expect(result).toMatch(/0=1/);
    expect(result).toMatch(/1:2/);
    expect(result).toMatch(/2:3/);
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

    expect(result).toMatch(/0:1/);
    expect(result).toMatch(/1:2/);
    expect(result).toMatch(/2=3/);
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

    expect(result).toMatch(/##\$13.00##/);
});
