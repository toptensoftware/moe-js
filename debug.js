var str = "Hello \\ \n \t ${stuff} world";

var str2 = `Stuff \`blah\` \${stuff} \n\twhatever`;

var encoded = JSON.stringify(str).slice(1, -1).replace(/\$\{/g, "\\${").replace(/`/g, "\\`");

console.log(str2);