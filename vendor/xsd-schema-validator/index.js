'use strict';
// Ver package.json: a validação via Java está desativada de propósito.
function validateXML(_xml, _schema, callback) {
  callback(new Error('Validação Java desativada; use validateSchemaJsBased.'));
}
module.exports = { validateXML };
module.exports.default = module.exports;
