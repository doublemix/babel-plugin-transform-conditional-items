const babel = require('@babel/core')

const plugin = require( './index')

const code = `\
const okay = false;
const dokay = true;
const y = 6;

const maybeObj = dokay ? { myObject: 10 } : null;
const other = [10, 100, 1000];

function getObject () {
  return maybeObj
}
function randomName () {
  return "a"
}

const array = { x: 7, y ?? okay : 10, ["z"] ?? dokay : 11, [randomName()] ?? getObject(), maybeObj ??, a : 6 }
const g = {
  x: 6,
  y ??,
  z: 7, a: 7,
  ...maybeObj,
}

console.log(JSON.stringify(array));
console.log(JSON.stringify(g));
`

const output = babel.transformSync(code, {
  plugins: [
    plugin
  ],
  presets: [
    // '@babel/preset-env'
  ],
})

console.log(output.code)

const fn = new Function(output.code)
fn()
