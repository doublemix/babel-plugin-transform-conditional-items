const customParser = require("./parser");
const { types: t } = require("@babel/core");

module.exports = function plugin() {
  function isConditionalElement(it) {
    return it.type === "ConditionalElement";
  }
  function isConditionalProperty(it) {
    return it.type === 'ObjectConditionalProperty';
  }
  return {
    parserOverride(code, opts) {
      return customParser.parse(code, opts);
    },
    visitor: {
      ArrayExpression(path) {
        const { node, scope } = path;
        const elements = node.elements;

        let i = elements.findIndex((it) => isConditionalElement(it));
        if (i === -1) {
          i = elements.length;
        }

        if (i === elements.length) {
          return;
        }

        const base = t.arrayExpression(elements.slice(0, i));

        let ref = scope.maybeGenerateMemoised(base);
        const exprList = [];

        if (ref) {
          exprList.push(t.assignmentExpression("=", t.cloneNode(ref), base));
        } else {
          ref = base;
        }

        for (; i < elements.length; i++) {
          const el = elements[i];
          if (isConditionalElement(el)) {
            let condition, value;
            if (el.shorthandCondition) {
              let valueRef = scope.maybeGenerateMemoised(el.value);
              let valueBase;
              if (valueRef) {
                valueBase = t.assignmentExpression(
                  "=",
                  t.cloneNode(valueRef),
                  el.value
                );
              } else {
                valueBase = valueRef = el.value;
              }
              condition = t.binaryExpression("!=", valueBase, t.nullLiteral());
              value = valueRef;
            } else {
              condition = el.condition;
              value = el.value;
            }
            exprList.push(
              t.logicalExpression(
                "&&",
                condition,
                t.callExpression(
                  t.memberExpression(t.cloneNode(ref), t.identifier("push")),
                  [value]
                )
              )
            );
          } else if (t.isExpression(el)) {
            exprList.push(
              t.callExpression(
                t.memberExpression(t.cloneNode(ref), t.identifier("push")),
                [el]
              )
            );
          } else {
            // more complex array element, give opportunity for other plugins to simplify
            exprList.push(
              t.callExpression(
                t.memberExpression(t.cloneNode(ref), t.identifier("push")),
                [t.spreadElement(t.arrayExpression([el]))]
              )
            );
          }
        }

        exprList.push(t.cloneNode(ref));

        path.replaceWith(t.sequenceExpression(exprList));
      },
      ObjectExpression (path) {
        const { node, scope } = path
        const { properties } = node

        let i = properties.findIndex(it => isConditionalProperty(it))

        if (i === -1) {
          return
        }

        const initObj = t.objectExpression(properties.slice(0, i))

        const baseRef = scope.maybeGenerateMemoised(initObj)
        const exprList = []

        if (baseRef != null) {
          exprList.push(t.assignmentExpression('=', t.cloneNode(baseRef), initObj))
        } else {
          baseRef = initObj
        }

        let finished = false
        for (; i < properties.length; i++) {
          const prop = properties[i]
          if (isConditionalProperty(prop)) {

            let computedKeyRef

            if (prop.computed) {
              computedKeyRef = scope.maybeGenerateMemoised(prop.key)
              if (computedKeyRef != null) {
                exprList.push(t.assignmentExpression('=', t.cloneNode(computedKeyRef), prop.key))
              } else {
                computedKeyRef = prop.key
              }
            } else {
              computedKeyRef = prop.key
            }

            let condition, value
            if (prop.shorthandCondition) {
              let valueBase, valueRef
              valueRef = scope.maybeGenerateMemoised(prop.value)
              if (valueRef != null) {
                valueBase = t.assignmentExpression('=', t.cloneNode(valueRef), prop.value)
              } else {
                valueRef = valueBase = prop.value
              }
              value = valueRef
              condition = t.binaryExpression('!=', valueBase, t.nullLiteral())
            } else {
              condition = prop.condition,
              value = prop.value
            }

            let update = t.assignmentExpression('=', t.memberExpression(t.cloneNode(baseRef), t.cloneNode(computedKeyRef), prop.computed), value)

            exprList.push(t.logicalExpression('&&', condition, update))
          } else {
            // leave all other unmodified so they can be handled by other plugins
            exprList.push(t.callExpression(this.addHelper('objectSpread'), [
              t.cloneNode(baseRef),
              { // need to construct node by hand because t.objectExpression doesn't like that there may still be ObjectConditionalProperty nodes left over
                type: "ObjectExpression",
                properties: properties.slice(i)
              }
            ]))
            finished = true
            i = properties.length // break next
          }
        }
        if (!finished) {
          exprList.push(t.cloneNode(baseRef))
        }
        path.replaceWith(t.sequenceExpression(exprList))
      }
    },
  };
};
